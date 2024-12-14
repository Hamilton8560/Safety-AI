import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import { PDFDocument } from 'https://cdn.skypack.dev/pdf-lib'

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

    // Extract text from PDF
    let extractedText = ''
    if (file.type === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer()
      try {
        // First try loading without ignoring encryption
        const pdfDoc = await PDFDocument.load(arrayBuffer)
        extractedText = await extractTextFromPDF(pdfDoc)
      } catch (error) {
        if (error.message.includes('encrypted')) {
          // If the PDF is encrypted, try loading it with ignoreEncryption option
          console.log('Attempting to load encrypted PDF...')
          const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true })
          extractedText = await extractTextFromPDF(pdfDoc)
        } else {
          console.error('PDF processing error:', error)
          throw error
        }
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

async function extractTextFromPDF(pdfDoc: PDFDocument): Promise<string> {
  try {
    const pages = pdfDoc.getPages()
    const textContent: string[] = []
    
    for (const page of pages) {
      try {
        const content = page.doc.catalog.get(page.doc.context.obj(page.ref))
        if (content) {
          const text = content.get('Contents')
          if (text) {
            textContent.push(text.toString())
          }
        }
      } catch (pageError) {
        console.warn('Error extracting text from page:', pageError)
        // Continue with next page even if this one fails
      }
    }
    
    return textContent.join('\n') || 'No text could be extracted from this PDF'
  } catch (error) {
    console.error('Error in extractTextFromPDF:', error)
    return 'Error extracting text from PDF'
  }
}