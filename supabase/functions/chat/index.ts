// /supabase/functions/chat/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function getEmbedding(text: string) {
  console.log("Getting embedding for text:", text.substring(0, 50) + "...");

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAiKey) {
    throw new Error("OpenAI API key not found in environment");
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
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
    console.log("Successfully got embedding");
    return data[0].embedding;
  } catch (error) {
    console.error("Error getting embedding:", error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Request received");

    const { question, documentId } = await req.json();
    console.log("Request params:", { question, documentId });

    if (!question || !documentId) {
      throw new Error("Question and documentId are required");
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials");
    }

    console.log("Initializing Supabase client");
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    // Get embedding for the question
    console.log("Getting question embedding");
    const questionEmbedding = await getEmbedding(question);

    // Query for relevant text chunks
    console.log("Querying for relevant chunks");
    const { data: chunks, error: matchError } = await supabaseClient.rpc(
      "match_document_sections",
      {
        query_embedding: questionEmbedding,
        document_id: documentId,
        match_threshold: 0.7,
        match_count: 5,
      }
    );

    if (matchError) {
      console.error("Error matching documents:", matchError);
      throw matchError;
    }

    console.log("Found chunks:", chunks?.length || 0);

    // Combine chunks into context
    const context = (chunks || []).map((chunk) => chunk.content).join("\n\n");

    console.log("Getting OpenAI response");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiKey) {
      throw new Error("OpenAI API key not found");
    }

    // Get response from OpenAI
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: `You are a helpful assistant answering questions about specific documents. 
                     Use the following context to answer the question, and if you're not sure, 
                     say so. Context: ${context}`,
          },
          { role: "user", content: question },
        ],
        temperature: 0.5,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error("OpenAI API error:", error);
      throw new Error(
        `OpenAI API error: ${error.error?.message || "Unknown error"}`
      );
    }

    const data = await response.json();
    console.log("Successfully got response");

    return new Response(
      JSON.stringify({
        response: data.choices[0].message.content,
        debug: { chunksFound: chunks?.length || 0 },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Function error:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        stack: error.stack,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
