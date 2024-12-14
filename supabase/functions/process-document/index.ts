import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Verify request method
    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    // Get the form data
    const formData = await req.formData();
    const file = formData.get('file');
    const userId = formData.get('userId');

    if (!file || !userId) {
      throw new Error('File and userId are required');
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Generate unique file path
    const fileExt = (file as File).name.split('.').pop();
    const filePath = `${userId}/${crypto.randomUUID()}.${fileExt}`;

    console.log('Uploading file:', filePath);

    // Upload file to Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file as File, {
        contentType: (file as File).type,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    let extractedText = '';
    
    if ((file as File).type === 'application/pdf') {
      try {
        // Convert file to array buffer and then to base64
        const arrayBuffer = await (file as File).arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Process in smaller chunks
        const chunkSize = 250000; // 250KB chunks
        const chunks = Math.ceil(uint8Array.length / chunkSize);
        let allText = '';
        
        console.log(`Processing PDF in ${chunks} chunks`);
        
        for (let i = 0; i < chunks; i++) {
          const start = i * chunkSize;
          const end = Math.min((i + 1) * chunkSize, uint8Array.length);
          const chunk = uint8Array.slice(start, end);
          
          // Convert chunk to base64
          const chunkBase64 = btoa(String.fromCharCode.apply(null, [...chunk]));
          
          console.log(`Processing chunk ${i + 1} of ${chunks}`);
          
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'You are a helpful assistant that extracts and processes text from documents.'
                },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: `Please extract and summarize the text content from this portion (${i + 1}/${chunks}) of the PDF document. Maintain the structure and formatting where possible.`
                    },
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:application/pdf;base64,${chunkBase64}`
                      }
                    }
                  ]
                }
              ],
              max_tokens: 4096
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`OpenAI API error for chunk ${i + 1}:`, errorText);
            throw new Error(`OpenAI API error: ${response.statusText}`);
          }

          const data = await response.json();
          allText += data.choices[0].message.content + '\n';
          
          // Add a delay between chunks
          if (i < chunks - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        extractedText = allText.trim();
        console.log('Successfully extracted text using OpenAI');
      } catch (error) {
        console.error('OpenAI processing error:', error);
        throw new Error(`Failed to process PDF: ${error.message}`);
      }
    }

    // Store document metadata
    const { data: documentData, error: documentError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        name: (file as File).name,
        file_path: filePath,
      })
      .select()
      .single();

    if (documentError) {
      throw new Error(`Database insert failed: ${documentError.message}`);
    }

    // Store extracted text and embeddings
    if (extractedText) {
      const { error: embeddingError } = await supabase
        .from('document_embeddings')
        .insert({
          document_id: documentData.id,
          content: extractedText
        });

      if (embeddingError) {
        console.error('Error storing embeddings:', embeddingError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        filePath,
        documentId: documentData.id,
        extractedText 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Process document error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});