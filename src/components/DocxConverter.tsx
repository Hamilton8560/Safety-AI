import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function DocxConverter() {
  const [text, setText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const processDocument = async (documentId: string, text: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No session");
      }

      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!anonKey) {
        throw new Error("Missing Supabase anon key");
      }

      const functionUrl = `${
        import.meta.env.VITE_SUPABASE_URL
      }/functions/v1/process-document`;

      console.log("Attempting to process document:", {
        url: functionUrl,
        documentId,
        textLength: text.length,
        sessionExists: !!session,
      });

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId,
          text,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          `Server responded with ${response.status}: ${
            errorData?.error || response.statusText
          }`
        );
      }

      const result = await response.json();
      toast.success(
        `Document processed with ${result.chunksProcessed} chunks embedded`
      );
    } catch (error) {
      console.error("Processing error details:", error);
      toast.error(error.message || "Failed to process document");
      throw error;
    }
  };
  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      // Convert DOCX to text
      const arrayBuffer = await file.arrayBuffer();
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer });
      const extractedText = result.value;
      setText(extractedText);

      // Get session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please login first");
        return;
      }

      // Upload original file to storage
      const fileName = `${Math.random().toString(36).substring(2)}.docx`;
      const filePath = `${session.user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create document record
      const { data: documentRecord, error: dbError } = await supabase
        .from("documents")
        .insert({
          user_id: session.user.id,
          name: file.name,
          file_path: filePath,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Process the extracted text
      await processDocument(documentRecord.id, extractedText);
    } catch (error) {
      console.error("Error details:", error);
      toast.error(`Failed to process file: ${error.message}`);
    } finally {
      setIsProcessing(false);
      // Reset file input
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>DOCX Converter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Input
            type="file"
            accept=".docx"
            onChange={handleFileChange}
            disabled={isProcessing}
            className="flex-1"
          />
          {isProcessing && (
            <Button disabled>
              <Upload className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </Button>
          )}
        </div>

        {text && (
          <div className="whitespace-pre-wrap font-mono text-sm bg-muted p-4 rounded-md max-h-96 overflow-y-auto">
            {text}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
