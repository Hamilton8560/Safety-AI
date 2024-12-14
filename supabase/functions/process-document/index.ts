import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const userId = formData.get('userId') as string

    if (!file || !userId) {
      return new Response(
        JSON.stringify({ error: 'File and userId are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Generate unique file path
    const fileExt = file.name.split('.').pop()
    const filePath = `${userId}/${crypto.randomUUID()}.${fileExt}`

    // Upload file to Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`)
    }

    // Get public URL for the uploaded file
    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath)

    let extractedText = ''
    
    if (file.type === 'application/pdf') {
      try {
        // Convert file to base64
        const arrayBuffer = await file.arrayBuffer()
        const base64String = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

        // Call OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o',
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
                    text: 'Please extract and summarize the text content from this PDF document. Maintain the structure and formatting where possible.'
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:application/pdf;base64,${base64String}`
                    }
                  }
                ]
              }
            ],
            max_tokens: 4096
          })
        })

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.statusText}`)
        }

        const data = await response.json()
        extractedText = data.choices[0].message.content
        console.log('Successfully extracted text using OpenAI')
      } catch (error) {
        console.error('OpenAI processing error:', error)
        throw new Error(`Failed to process PDF: ${error.message}`)
      }
    }

    // Store document metadata in database
    const { data: documentData, error: documentError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        name: file.name,
        file_path: filePath,
      })
      .select()
      .single()

    if (documentError) {
      throw new Error(`Database insert failed: ${documentError.message}`)
    }

    // Store the extracted text and embeddings
    if (extractedText) {
      const { error: embeddingError } = await supabase
        .from('document_embeddings')
        .insert({
          document_id: documentData.id,
          content: extractedText
        })

      if (embeddingError) {
        console.error('Error storing embeddings:', embeddingError)
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
    )

  } catch (error) {
    console.error('Process document error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})