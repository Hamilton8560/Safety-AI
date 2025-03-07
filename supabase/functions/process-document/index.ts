import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function cleanText(text: string): string {
  return text
    .replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, "") // Remove control chars
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

function createChunks(text: string, maxChunkLength: number = 1000): string[] {
  // First split into paragraphs
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const paragraph of paragraphs) {
    const cleanParagraph = cleanText(paragraph);
    const paragraphLength = cleanParagraph.length;

    if (paragraphLength > maxChunkLength) {
      // If a single paragraph is too long, split into sentences
      const sentences = cleanParagraph.match(/[^.!?]+[.!?]+/g) || [
        cleanParagraph,
      ];

      for (const sentence of sentences) {
        const cleanSentence = cleanText(sentence);

        if (
          currentLength + cleanSentence.length > maxChunkLength &&
          currentChunk.length > 0
        ) {
          chunks.push(currentChunk.join(" "));
          currentChunk = [];
          currentLength = 0;
        }

        currentChunk.push(cleanSentence);
        currentLength += cleanSentence.length;
      }
    } else {
      if (
        currentLength + paragraphLength > maxChunkLength &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk.join(" "));
        currentChunk = [];
        currentLength = 0;
      }
      currentChunk.push(cleanParagraph);
      currentLength += paragraphLength;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks
    .map((chunk) => cleanText(chunk))
    .filter((chunk) => chunk.length > 0);
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
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const { documentId, filePath } = await req.json();
    console.log("Processing document:", documentId, filePath);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Download the file
    const { data: fileData, error: downloadError } =
      await supabaseClient.storage.from("documents").download(filePath);

    if (downloadError) {
      throw new Error(`Error downloading file: ${downloadError.message}`);
    }

    // Convert file to text
    const text = await fileData.text();
    console.log("Converting to text");

    // Create chunks
    console.log("Creating chunks");
    const chunks = createChunks(text);
    console.log(`Created ${chunks.length} chunks`);

    // Delete existing embeddings
    const { error: deleteError } = await supabaseClient
      .from("document_embeddings")
      .delete()
      .eq("document_id", documentId);

    if (deleteError) {
      throw deleteError;
    }

    // Process each chunk
    console.log("Processing chunks");
    for (const [index, chunk] of chunks.entries()) {
      console.log(`Processing chunk ${index + 1}/${chunks.length}`);
      console.log("Chunk length:", chunk.length);

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
