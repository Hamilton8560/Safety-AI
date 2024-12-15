import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PDFDocument } from "pdf-lib";

interface Document {
  id: string;
  name: string;
  created_at: string;
  file_path: string;
  is_processed?: boolean;
}

export const DocumentSection = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);

  const fetchDocuments = async () => {
    try {
      setIsLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please login first");
        return;
      }

      const { data: documentRecords, error: documentsError } = await supabase
        .from("documents")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (documentsError) throw documentsError;

      setDocuments(documentRecords || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error("Failed to load documents");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      if (!validTypes.includes(file.type)) {
        toast.error("Please select a PDF or DOCX file");
        return;
      }
      setSelectedFile(file);
    }
  };

  const processDocument = async (documentId: string, filePath: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("No session");
  
      // First, download the file from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("documents")
        .download(filePath);
  
      if (downloadError) {
        throw new Error(`Error downloading file: ${downloadError.message}`);
      }
  
      // Extract text based on file type
      let text = '';
      const fileExt = filePath.split('.').pop()?.toLowerCase();
  
      if (fileExt === 'docx') {
        const arrayBuffer = await fileData.arrayBuffer();
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else if (fileExt === 'pdf') {
        // For PDFs, you'll need to implement PDF text extraction
        throw new Error("PDF processing not yet implemented");
      } else {
        throw new Error("Unsupported file type");
      }
  
      if (!text) {
        throw new Error("No text could be extracted from the document");
      }
  
      const functionUrl = `${
        import.meta.env.VITE_SUPABASE_URL
      }/functions/v1/process-docx`;
  
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          documentId,
          text,
        }),
      });
  
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to process document");
      }
  
      setDocuments((docs) =>
        docs.map((doc) =>
          doc.id === documentId ? { ...doc, is_processed: true } : doc
        )
      );
  
      toast.success("Document processed successfully");
    } catch (error) {
      console.error("Processing error:", error);
      toast.error(error.message || "Failed to process document");
      throw error;
    }
  };
  

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file first");
      return;
    }
  
    setIsUploading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please login first");
        return;
      }
  
      // Upload to storage first
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${session.user.id}/${fileName}`;
  
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, selectedFile);
  
      if (uploadError) throw uploadError;
  
      // Create document record in the database
      const { data: documentRecord, error: dbError } = await supabase
        .from("documents")
        .insert({
          user_id: session.user.id,
          name: selectedFile.name,
          file_path: filePath,
        })
        .select()
        .single();
  
      if (dbError) throw dbError;
  
      toast.success("File uploaded successfully");
  
      // Process the document for embeddings
      await processDocument(documentRecord.id, filePath);
  
      await fetchDocuments();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload file");
    } finally {
      setIsUploading(false);
      setSelectedFile(null);
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (fileInput) {
        fileInput.value = "";
      }
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .download(doc.file_path);

      if (error) throw error;

      // Create a download link
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Failed to download file");
    }
  };

  const handleDeleteDocument = async (doc: Document) => {
    try {
      // Delete from storage first
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([doc.file_path]);

      if (storageError) throw storageError;

      // Then delete from database
      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id);

      if (dbError) throw dbError;

      await fetchDocuments();
      toast.success("Document deleted successfully");
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete document");
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Upload Document</CardTitle>
        </CardHeader>
     
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".docx"
                onChange={handleFileChange}
                className="flex-1"
              />
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
              >
                <Upload className="mr-2 h-4 w-4" />
                {isUploading ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Your Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Upload Date</TableHead>
                  <TableHead className="w-[150px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground"
                    >
                      Loading documents...
                    </TableCell>
                  </TableRow>
                ) : documents.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground"
                    >
                      No documents uploaded yet
                    </TableCell>
                  </TableRow>
                ) : (
                  documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-medium">{doc.name}</TableCell>
                      <TableCell>
                        {new Date(doc.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDownload(doc)}
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteDocument(doc)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
};