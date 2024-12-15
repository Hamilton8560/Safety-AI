import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageSquare, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  document_id: string;
  user_id: string;
  processing_time?: number;
  token_count?: number;
  created_at?: string;
  sourceSections?: Array<{
    content: string;
    similarity: number;
  }>;
}

interface Document {
  id: string;
  name: string;
  created_at: string;
}

export const ChatSection = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [showSources, setShowSources] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (selectedDocument) {
      fetchChatHistory();
    } else {
      setMessages([]);
    }
  }, [selectedDocument]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchChatHistory = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !selectedDocument) return;

      const { data: chatHistory, error } = await supabase
        .from("chat_logs")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("document_id", selectedDocument)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(chatHistory || []);
    } catch (error) {
      console.error("Error fetching chat history:", error);
    }
  };

  const fetchDocuments = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: docs, error } = await supabase
        .from("documents")
        .select("id, name, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(docs || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
    }
  };

  const saveChatMessage = async (message: ChatMessage) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Create a sanitized message object for the database
      const messageToSave = {
        role: message.role,
        content: message.content,
        document_id: message.document_id,
        user_id: message.user_id,
        processing_time: message.processing_time || null,
        token_count: message.token_count || null,
        created_at: message.created_at,
        source_sections: message.sourceSections || null // Make sure your database column is named source_sections
      };

      const { data, error } = await supabase
        .from("chat_logs")
        .insert([messageToSave])
        .select()
        .single();

      if (error) {
        console.error("Supabase error details:", error);
        throw error;
      }
      if (data) {
        setMessages(prev => 
          prev.map(msg => 
            msg === message ? { ...msg, id: data.id } : msg
          )
        );
      }
    } catch (error) {
      console.error("Error saving chat message:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !selectedDocument) return;

    const userMessage = input.trim();
    setInput("");
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const userMessageObj: ChatMessage = {
      role: "user",
      content: userMessage,
      document_id: selectedDocument,
      user_id: session.user.id,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessageObj]);
    await saveChatMessage(userMessageObj);
    
    setIsLoading(true);
    const startTime = performance.now();

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: userMessage,
            documentId: selectedDocument,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      const processingTime = performance.now() - startTime;

      const assistantMessageObj: ChatMessage = {
        role: "assistant",
        content: data.response,
        document_id: selectedDocument,
        user_id: session.user.id,
        processing_time: Math.round(processingTime),
        token_count: data.tokenCount, // Assuming the backend returns this
        created_at: new Date().toISOString(),
        sourceSections: data.sourceSections,
      };

      setMessages((prev) => [...prev, assistantMessageObj]);
      await saveChatMessage(assistantMessageObj);

    } catch (error) {
      console.error("Error:", error);
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: "I apologize, but I encountered an error processing your request. Please try again.",
        document_id: selectedDocument,
        user_id: session.user.id,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      await saveChatMessage(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="flex flex-col h-full max-h-[calc(65vh-2rem)] min-h-[600px]">
      <CardHeader className="flex-none space-y-2 pb-4">
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Chat with Your Documents
        </CardTitle>
        <Select
          value={selectedDocument || ""}
          onValueChange={(value) => setSelectedDocument(value)}
        >
          <SelectTrigger className="w-full max-w-[300px]">
            <SelectValue placeholder="Select a document to chat with" />
          </SelectTrigger>
          <SelectContent>
            {documents.map((doc) => (
              <SelectItem key={doc.id} value={doc.id}>
                {doc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4 p-4 h-full overflow-hidden">
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto min-h-0"
          style={{ 
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgb(203 213 225) transparent'
          }}
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-4" />
              <p>Select a document and start a conversation!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 pb-4">
              {messages.map((message, index) => (
                <div key={message.id || index} className="flex flex-col gap-2">
                  <div
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                      {message.processing_time && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Response time: {(message.processing_time / 1000).toFixed(2)}s
                          {message.token_count && ` • Tokens: ${message.token_count}`}
                        </p>
                      )}
                    </div>
                  </div>
                  {message.sourceSections && message.sourceSections.length > 0 && (
                    <>
                      <div className="flex justify-start">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setShowSources(showSources === index ? null : index)
                          }
                        >
                          {showSources === index ? "Hide Sources" : "Show Sources"}
                        </Button>
                      </div>
                      {showSources === index && (
                        <div className="pl-4 space-y-2">
                          {message.sourceSections.map((section, sIdx) => (
                            <div
                              key={sIdx}
                              className="text-sm bg-muted/50 p-2 rounded"
                            >
                              <div className="text-xs text-muted-foreground mb-1">
                                Source Relevance:{" "}
                                {(section.similarity * 100).toFixed(1)}%
                              </div>
                              <div className="break-words">
                                {section.content}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-4 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2 mt-auto pt-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading || !selectedDocument}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !selectedDocument}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};