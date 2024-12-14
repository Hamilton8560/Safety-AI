import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MessageSquare, Send } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const ChatSection = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    
    // Add user message to chat
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    
    setIsLoading(true);
    
    // Placeholder for API call - will be implemented later
    // Simulating response for now
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "This is a placeholder response. The AI integration will be implemented soon." },
      ]);
      setIsLoading(false);
    }, 1000);
  };

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Chat with Your Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 gap-4">
        <ScrollArea className="flex-1 pr-4">
          <div className="flex flex-col gap-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                <MessageSquare className="h-8 w-8 mb-4" />
                <p>No messages yet. Start a conversation!</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
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
                    <p className="text-sm">{message.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};