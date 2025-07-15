// @deno-types="https://raw.githubusercontent.com/supabase/supabase/master/packages/functions/src/types/supabase.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

interface PodcastSegment {
  speaker: 'Alex' | 'Jordan';
  text: string;
}

interface PodcastResponse {
  script?: string;
  audioUrl?: string;
  status: 'processing' | 'completed' | 'failed';
  message?: string;
  cached?: boolean;
  error?: string;
  lastHeartbeat?: string; // Add heartbeat tracking
  processingStage?: 'script' | 'audio' | 'upload'; // Add processing stage tracking
}

// Helper function to concatenate Uint8Arrays
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export async function generatePodcast(pdfId: string, pdfName: string, forceRegenerate = false): Promise<Response> {
  try {
    // Validate required environment variables
    if (!openAIApiKey) {
      console.error('[Error] OpenAI API key is not configured');
      throw new Error('OpenAI API key is not configured');
    }

    if (!pdfId || !pdfName) {
      console.error('[Error] Missing required parameters:', { pdfId, pdfName });
      throw new Error('PDF ID and name are required');
    }

    // First verify the PDF exists
    const { data: pdfExists, error: pdfError } = await supabase
      .from('pdfs')
      .select('id')
      .eq('id', pdfId)
      .single();

    if (pdfError || !pdfExists) {
      console.error('[Error] PDF not found:', { pdfId, error: pdfError });
      throw new Error(`PDF not found: ${pdfError?.message || 'Unknown error'}`);
    }

    // Check if analysis exists and has embeddings
    let { data: analysis, error: analysisError } = await supabase
      .from('pdf_analysis')
      .select('id, podcast_status, summary, embedding_data')
      .eq('pdf_id', pdfId)
      .single();

    // If no analysis exists or missing embeddings, create them first
    if ((!analysis || !analysis.embedding_data || !analysis.summary) && analysisError?.code === 'PGRST116') {
      console.log('[Podcast] No analysis or embeddings found, generating them first');
      
      // Call analyzePDF to generate summary and embeddings
      const response = await fetch(new URL(Deno.env.get('SUPABASE_URL') + '/functions/v1/pdf-chat').href, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'analyze_pdf',
          pdfId,
          pdfUrl: pdfExists.file_path,
          pdfName
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF analysis');
      }

      // Refetch analysis after generation
      const { data: updatedAnalysis, error: refetchError } = await supabase
        .from('pdf_analysis')
        .select('id, podcast_status, summary, embedding_data')
        .eq('pdf_id', pdfId)
        .single();

      if (refetchError) {
        throw new Error('Failed to fetch updated analysis');
      }

      analysis = updatedAnalysis;
    }

    // Start new generation with initial state
    const startTime = new Date().toISOString();
    
    try {
      if (analysis) {
        // Update existing row
        const { error: updateError } = await supabase
          .from('pdf_analysis')
          .update({
            podcast_status: 'processing',
            podcast_generated_at: startTime,
            podcast_error: null,
            updated_at: startTime
          })
          .eq('pdf_id', pdfId);

        if (updateError) {
          console.error('[Error] Failed to update existing row:', updateError);
          throw updateError;
        }
      } else {
        // Insert new row
        const { error: insertError } = await supabase
          .from('pdf_analysis')
          .insert({
            pdf_id: pdfId,
            podcast_status: 'processing',
            podcast_generated_at: startTime,
            podcast_error: null,
            updated_at: startTime
          });

        if (insertError) {
          console.error('[Error] Failed to insert new row:', insertError);
          throw insertError;
        }
      }
    } catch (dbError) {
      console.error('[Error] Database operation failed:', dbError);
      throw new Error(`Failed to ${analysis ? 'update' : 'create'} podcast analysis record: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
    }

    // Generate script using the analysis and embeddings
    console.log(`[Script Generator] Starting script generation for PDF: ${pdfName}`);
    const script = await generatePodcastScript(pdfName, pdfId);
    
    // Save script
    console.log('[Database] Saving script');
    const { error: scriptError } = await supabase
      .from('pdf_analysis')
      .update({
        podcast_script: script,
        updated_at: new Date().toISOString()
      })
      .eq('pdf_id', pdfId);

    if (scriptError) {
      console.error('[Database] Error saving script:', scriptError);
      throw new Error('Failed to save podcast script');
    }

    // Parse script into segments
    console.log('[Script Parser] Parsing script into segments');
    const segments = parseScript(script);

    // Generate audio for each segment
    console.log('[Audio Generator] Starting audio generation');
    const audioSegments: Uint8Array[] = [];
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const audio = await generateSingleAudioSegment(segment, i);
      audioSegments.push(audio);
    }

    // Combine audio segments
    console.log('[Audio Generator] Combining audio segments');
    const combinedAudio = concatUint8Arrays(audioSegments);
    
    // Create organized filename with timestamp
    const timestamp = new Date().toISOString();
    const sanitizedPdfName = pdfName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const audioFileName = `${sanitizedPdfName}/${pdfId}/${timestamp}.mp3`;

    // Upload combined audio to storage
    console.log('[Storage] Uploading audio file');
    const { error: uploadError } = await supabase.storage
      .from('podcasts')
      .upload(audioFileName, combinedAudio, {
        contentType: 'audio/mp3',
        cacheControl: '3600'
      });

    if (uploadError) {
      throw new Error(`Failed to upload audio: ${uploadError.message}`);
    }

    // Get public URL for the uploaded audio
    const { data: { publicUrl } } = supabase.storage
      .from('podcasts')
      .getPublicUrl(audioFileName);

    // Save final state with both script and audio URL
    console.log('[Database] Saving final state with audio URL');
    const completionTime = new Date().toISOString();
    const { error: finalError } = await supabase
      .from('pdf_analysis')
      .update({
        podcast_script: script,
        podcast_audio_url: publicUrl,
        podcast_status: 'completed',
        podcast_generated_at: completionTime,
        podcast_error: null,
        updated_at: completionTime
      })
      .eq('pdf_id', pdfId);

    if (finalError) {
      console.error('[Database] Error saving final state:', finalError);
      throw new Error('Failed to save podcast data');
    }

    console.log('[Success] Podcast generation completed');
    return new Response(JSON.stringify({
      script,
      audioUrl: publicUrl,
      status: 'completed',
      message: 'Podcast generated successfully'
    }), { headers: corsHeaders() });

  } catch (error) {
    console.error('[Error] Podcast generation failed:', error);
    
    // Update database with error status
    const errorTime = new Date().toISOString();
    const { error: dbError } = await supabase
      .from('pdf_analysis')
      .update({
        podcast_status: 'failed',
        podcast_error: error instanceof Error ? error.message : 'Unknown error',
        updated_at: errorTime
      })
      .eq('pdf_id', pdfId);

    if (dbError) {
      console.error('[Database] Error saving error state:', dbError);
    }

    return new Response(JSON.stringify({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Failed to generate podcast'
    }), { 
      status: 500, 
      headers: corsHeaders()
    });
  }
}

export async function checkPodcastStatus(pdfId: string): Promise<Response> {
  try {
    console.log(`[Status Check] Checking podcast status for PDF: ${pdfId}`);

    // First verify the PDF exists
    const { data: pdfExists, error: pdfError } = await supabase
      .from('pdfs')
      .select('id')
      .eq('id', pdfId)
      .single();

    if (pdfError) {
      console.error('[Status Check] PDF not found:', { pdfId, error: pdfError });
      throw new Error(`PDF not found: ${pdfError.message}`);
    }

    // Check podcast analysis status
    const { data: analysis, error } = await supabase
      .from('pdf_analysis')
      .select('podcast_script, podcast_audio_url, podcast_status, podcast_error, podcast_generated_at')
      .eq('pdf_id', pdfId)
      .single();

    if (error) {
      console.error('[Status Check] Error fetching podcast status:', { pdfId, error });
      
      // If no record exists, return appropriate status
      if (error.code === 'PGRST116') { // PostgreSQL "not found" error
        console.log('[Status Check] No podcast analysis record found, returning not started status');
        return new Response(JSON.stringify({
          status: 'not_started',
          message: 'Podcast has not been generated yet'
        }), { headers: corsHeaders() });
      }
      
      throw error;
    }

    console.log('[Status Check] Successfully retrieved podcast status:', {
      status: analysis?.podcast_status,
      hasScript: !!analysis?.podcast_script,
      hasAudio: !!analysis?.podcast_audio_url
    });

    const response = {
      script: analysis?.podcast_script,
      audioUrl: analysis?.podcast_audio_url,
      status: analysis?.podcast_status || 'failed',
      error: analysis?.podcast_error,
      generatedAt: analysis?.podcast_generated_at
    };

    return new Response(JSON.stringify(response), { headers: corsHeaders() });
  } catch (error) {
    console.error('[Status Check] Failed to check podcast status:', error);
    return new Response(JSON.stringify({
      status: 'failed',
      error: error instanceof Error ? error.message : 'Failed to check podcast status',
      details: error instanceof Error ? error.stack : undefined
    }), { 
      status: 500, 
      headers: corsHeaders() 
    });
  }
}

async function generateSingleAudioSegment(segment: PodcastSegment, index: number): Promise<Uint8Array> {
  console.log(`[TTS] Generating audio for segment ${index + 1} - Speaker: ${segment.speaker}`);
  console.log(`[TTS] Text content: "${segment.text.substring(0, 50)}..."`);

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: segment.speaker === 'Alex' ? 'alloy' : 'echo',
      input: segment.text,
      response_format: 'mp3',
      speed: 1.0
    })
  });

  if (!res.ok) {
    console.error(`[TTS] Error generating audio for segment ${index + 1}:`, await res.text());
    throw new Error(`TTS Error (${res.status}): ${await res.text()}`);
  }
  
  console.log(`[TTS] Successfully generated audio for segment ${index + 1}`);
  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function parseScript(script: string): PodcastSegment[] {
  console.log('[Script Parser] Starting to parse podcast script');
  const lines = script.split('\n');
  const segments: PodcastSegment[] = [];
  let currentSpeaker: 'Alex' | 'Jordan' | null = null;
  let currentText = '';

  for (const line of lines) {
    if (/^\[?ALEX:?\]?/i.test(line)) {
      if (currentSpeaker && currentText.trim()) {
        segments.push({ speaker: currentSpeaker, text: currentText.trim() });
        console.log(`[Script Parser] Added ${currentSpeaker} segment: "${currentText.substring(0, 50)}..."`);
      }
      currentSpeaker = 'Alex';
      currentText = line.replace(/^\[?ALEX:?\]?/i, '').trim();
    } else if (/^\[?JORDAN:?\]?/i.test(line)) {
      if (currentSpeaker && currentText.trim()) {
        segments.push({ speaker: currentSpeaker, text: currentText.trim() });
        console.log(`[Script Parser] Added ${currentSpeaker} segment: "${currentText.substring(0, 50)}..."`);
      }
      currentSpeaker = 'Jordan';
      currentText = line.replace(/^\[?JORDAN:?\]?/i, '').trim();
    } else if (currentSpeaker) {
      currentText += ' ' + line.trim();
    }
  }

  if (currentSpeaker && currentText.trim()) {
    segments.push({ speaker: currentSpeaker, text: currentText.trim() });
    console.log(`[Script Parser] Added final ${currentSpeaker} segment: "${currentText.substring(0, 50)}..."`);
  }

  console.log(`[Script Parser] Finished parsing script into ${segments.length} segments`);
  return segments;
}

async function generatePodcastScript(pdfName: string, pdfId: string): Promise<string> {
  console.log(`[Script Generator] Starting script generation for PDF: ${pdfName}`);
  
  try {
    // Get document analysis and embeddings
    const { data: analysis, error: fetchError } = await supabase
      .from('pdf_analysis')
      .select('summary, embedding_data')
      .eq('pdf_id', pdfId)
      .single();

    if (fetchError) {
      console.error('[Script Generator] Error fetching document analysis:', fetchError);
      throw fetchError;
    }

    let contextPrompt = '';
    if (analysis?.summary) {
      contextPrompt = `Here is a summary of the document:\n\n${analysis.summary}\n\n`;
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a professional podcast script writer. Create an engaging, conversational script for a 10-15 minute podcast episode reviewing a PDF document. ${contextPrompt}The script should:
                    1. Have two distinct hosts (Alex and Jordan) with different speaking styles
                    2. Include natural conversation flow with questions, answers, and commentary
                    3. Cover the document section by section
                    4. Highlight key insights and important points
                    5. Use casual, engaging language like a real podcast
                    6. Include transitions and natural pauses
                    7. End with thoughtful conclusions

                    Format the script clearly with [ALEX:] and [JORDAN:] tags for each speaker.`
          },
          {
            role: 'user',
            content: `Create a detailed podcast script reviewing the PDF document titled "${pdfName}". Use the provided summary to create an accurate and informative discussion between the hosts.`
          }
        ],
        max_tokens: 1500,
        temperature: 0.8
      })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null);
      console.error('[Script Generator] OpenAI API error:', errorData || await res.text());
      throw new Error(`OpenAI API error (${res.status}): ${errorData?.error?.message || res.statusText}`);
    }
    
    const data = await res.json();
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Invalid response format from OpenAI API');
    }

    const script = data.choices[0].message.content;
    console.log('[Script Generator] Successfully generated script');
    console.log(`[Script Generator] Script preview: "${script.substring(0, 100)}..."`);
    
    return script;
  } catch (error) {
    console.error('[Script Generator] Failed to generate script:', error);
    throw new Error(`Failed to generate podcast script: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function delay(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

function jsonHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
  };
}
