import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readDocx } from "https://esm.sh/mammoth@1.7.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function extractText(fileData: Blob, fileExt: string): Promise<string> {
  try {
    if (fileExt === "docx") {
      const arrayBuffer = await fileData.arrayBuffer();
      const result = await readDocx({ arrayBuffer });
      return result.value;
    } else {
      return await fileData.text();
    }
  } catch (error) {
    console.error("Text extraction error:", error);
    throw error;
  }
}

function createChunks(text: string, maxChunkLength: number = 1000): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const paragraph of paragraphs) {
    // Clean the paragraph
    const cleanParagraph = paragraph.replace(/\s+/g, " ").trim();

    if (!cleanParagraph) continue;

    if (cleanParagraph.length > maxChunkLength) {
      // If paragraph is too long, split into sentences
      const sentences = cleanParagraph.match(/[^.!?]+[.!?]+/g) || [
        cleanParagraph,
      ];

      for (const sentence of sentences) {
        const cleanSentence = sentence.trim();

        if (
          currentLength + cleanSentence.length > maxChunkLength &&
          currentChunk.length > 0
        ) {
          chunks.push(currentChunk.join(" "));
          currentChunk = [];
          currentLength = 0;
        }

        currentChunk.push(cleanSentence);
        currentLength += cleanSentence.length + 1;
      }
    } else {
      if (
        currentLength + cleanParagraph.length > maxChunkLength &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk.join(" "));
        currentChunk = [];
        currentLength = 0;
      }
      currentChunk.push(cleanParagraph);
      currentLength += cleanParagraph.length + 1;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => chunk.trim());
}

async function createEmbedding(text: string) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: "text-embedding-3-small",
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(
      `OpenAI API error: ${error.error?.message || "Unknown error"}`
    );
  }

  const { data } = await response.json();
  return data[0].embedding;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Received request body:", body); // Debug log

    const { documentId, text } = body;

    if (!documentId) {
      throw new Error("documentId is required");
    }

    if (!text) {
      throw new Error("text is required");
    }

    console.log("Processing document:", documentId);
    console.log("Text length:", text.length);
    console.log("Sample text:", text.substring(0, 100));

    // Create chunks directly from the provided text
    const chunks = createChunks(text);
    console.log(`Created ${chunks.length} chunks`);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Delete existing embeddings
    const { error: deleteError } = await supabaseClient
      .from("document_embeddings")
      .delete()
      .eq("document_id", documentId);

    if (deleteError) {
      throw deleteError;
    }

    // Process chunks
    for (const [index, chunk] of chunks.entries()) {
      try {
        const embedding = await createEmbedding(chunk);

        const { error: insertError } = await supabaseClient
          .from("document_embeddings")
          .insert({
            document_id: documentId,
            content: chunk,
            embedding,
            chunk_index: index,
          });

        if (insertError) {
          throw insertError;
        }

        console.log(`Processed chunk ${index + 1}/${chunks.length}`);
      } catch (error) {
        console.error(`Error processing chunk ${index + 1}:`, error);
        throw error;
      }
    }

    // Update document status
    await supabaseClient
      .from("documents")
      .update({ is_processed: true })
      .eq("id", documentId);

    return new Response(
      JSON.stringify({
        success: true,
        chunksProcessed: chunks.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.stack,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
