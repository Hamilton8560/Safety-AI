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
      console.error('Upload error:', uploadError)
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

        // Split large documents into chunks
        const maxChunkSize = 500000 // 500KB chunks
        const totalSize = base64String.length
        const chunks = Math.ceil(totalSize / maxChunkSize)
        
        console.log(`Processing PDF in ${chunks} chunks`)
        
        let allText = ''
        
        // Process document in chunks
        for (let i = 0; i < chunks; i++) {
          const start = i * maxChunkSize
          const end = Math.min((i + 1) * maxChunkSize, totalSize)
          const chunk = base64String.slice(start, end)
          
          console.log(`Processing chunk ${i + 1} of ${chunks}`)
          
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
                        url: `data:application/pdf;base64,${chunk}`
                      }
                    }
                  ]
                }
              ],
              max_tokens: 4096
            })
          })

          if (!response.ok) {
            console.error(`OpenAI API error for chunk ${i + 1}:`, await response.text())
            throw new Error(`OpenAI API error: ${response.statusText}`)
          }

          const data = await response.json()
          allText += data.choices[0].message.content + '\n'
          
          // Add a small delay between chunks to avoid rate limiting
          if (i < chunks - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
        
        extractedText = allText.trim()
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