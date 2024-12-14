import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Upload, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const Dashboard = () => {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [activeTab, setActiveTab] = useState("documents");

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      const { data: subscription, error: subscriptionError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (subscriptionError) {
        console.error('Error checking subscription:', subscriptionError);
        toast.error("Error checking subscription status");
        navigate("/register");
        return;
      }

      if (!subscription) {
        toast.error("Please subscribe to access the dashboard");
        navigate("/register");
        return;
      }

      // Fetch user's documents
      const { data: userDocuments, error: documentsError } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (documentsError) {
        toast.error("Error fetching documents");
      } else {
        setDocuments(userDocuments || []);
      }
    };

    checkAuth();
  }, [navigate]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error("Please select a PDF file");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file first");
      return;
    }

    setIsUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please login first");
        return;
      }

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('userId', session.user.id);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-document`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to process document');
      }

      const data = await response.json();
      setExtractedText(data.extractedText || '');
      toast.success("File uploaded successfully");
      
      // Refresh documents list
      const { data: userDocuments } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      
      setDocuments(userDocuments || []);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error.message || "Failed to upload file");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    const newMessage = { role: "user", content: message };
    setChatMessages([...chatMessages, newMessage]);
    setMessage("");

    // TODO: Implement actual chat functionality with the documents
    // This is a placeholder response
    setTimeout(() => {
      setChatMessages(prev => [...prev, {
        role: "assistant",
        content: "I'm still being implemented, but I'll be able to help you with your documents soon!"
      }]);
    }, 1000);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-[#313338] text-gray-100">
      <header className="border-b border-[#1e1f22] bg-[#2b2d31]">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Document Chat</h1>
          <Button variant="ghost" onClick={handleSignOut} className="text-gray-300 hover:text-white">
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="documents" className="space-y-4">
          <TabsList className="bg-[#2b2d31]">
            <TabsTrigger value="documents" className="data-[state=active]:bg-[#404249]">
              <FileText className="w-4 h-4 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="chat" className="data-[state=active]:bg-[#404249]">
              <MessageSquare className="w-4 h-4 mr-2" />
              Chat
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-4">
            <Card className="bg-[#2b2d31] border-[#1e1f22]">
              <CardHeader>
                <CardTitle className="text-gray-100">Upload Document</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Input
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="flex-1 bg-[#383a40] border-[#1e1f22] text-gray-100"
                    />
                    <Button 
                      onClick={handleUpload}
                      disabled={!selectedFile || isUploading}
                      className="bg-[#5865f2] hover:bg-[#4752c4]"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {isUploading ? "Uploading..." : "Upload"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#2b2d31] border-[#1e1f22]">
              <CardHeader>
                <CardTitle className="text-gray-100">Your Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] rounded-md border border-[#1e1f22]">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-[#1e1f22] hover:bg-[#383a40]">
                        <TableHead className="text-gray-300">Name</TableHead>
                        <TableHead className="text-gray-300">Uploaded</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {documents.map((doc) => (
                        <TableRow key={doc.id} className="border-[#1e1f22] hover:bg-[#383a40]">
                          <TableCell className="text-gray-100">{doc.name}</TableCell>
                          <TableCell className="text-gray-100">{formatDate(doc.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chat" className="space-y-4">
            <Card className="bg-[#2b2d31] border-[#1e1f22]">
              <CardContent className="p-0">
                <ScrollArea className="h-[500px] p-4">
                  <div className="space-y-4">
                    {chatMessages.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 ${
                            msg.role === 'user'
                              ? 'bg-[#5865f2] text-white'
                              : 'bg-[#383a40] text-gray-100'
                          }`}
                        >
                          {msg.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="border-t border-[#1e1f22] p-4">
                  <div className="flex gap-2">
                    <Input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Ask about your documents..."
                      className="flex-1 bg-[#383a40] border-[#1e1f22] text-gray-100"
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    />
                    <Button
                      onClick={handleSendMessage}
                      className="bg-[#5865f2] hover:bg-[#4752c4]"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;