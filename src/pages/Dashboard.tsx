import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Settings, BarChart, File } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentSection } from "@/components/dashboard/DocumentSection";
import { ChatSection } from "@/components/dashboard/ChatSection";

const Dashboard = () => {
  const navigate = useNavigate();
  const [documentCount, setDocumentCount] = useState(0);
  const [session, setSession] = useState(null);
  const [averageProcessingTime, setAverageProcessingTime] = useState<number | null>(null);

  const fetchDocumentCount = async (userId: string) => {
    try {
      const { count, error } = await supabase
        .from('documents')
        .select('*', { count: 'exact' })
        .eq('user_id', userId);

      if (error) throw error;
      setDocumentCount(count || 0);
    } catch (error) {
      console.error('Error fetching document count:', error);
      toast.error("Error fetching document count");
    }
  };

  const fetchAverageProcessingTime = async (userId: string) => {
    try {
      console.log('Fetching processing times for user:', userId);
      
      const { data, error } = await supabase
        .from('messages')
        .select('processing_time')
        .eq('user_id', userId)
        .not('processing_time', 'is', null);

      if (error) throw error;

      console.log('Retrieved messages data:', data);

      if (data && data.length > 0) {
        const totalTime = data.reduce((sum, message) => {
          console.log('Processing time for message:', message.processing_time);
          return sum + (message.processing_time || 0);
        }, 0);
        
        console.log('Total time:', totalTime);
        console.log('Number of messages:', data.length);
        
        const average = totalTime / data.length;
        console.log('Raw average:', average);
        
        // Convert to seconds and round to 1 decimal place
        const finalAverage = Math.round(average / 100) / 10;
        console.log('Final average in seconds:', finalAverage);
        
        setAverageProcessingTime(finalAverage);
      } else {
        console.log('No valid processing time data found');
        setAverageProcessingTime(null);
      }
    } catch (error) {
      console.error('Error fetching average processing time:', error);
      toast.error("Error fetching processing time");
    }
  };

  // Handle initial auth check and session setup
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        
        if (error) throw error;
        
        if (!currentSession) {
          navigate("/login");
          return;
        }

        setSession(currentSession);

        // Check subscription status
        const { data: subscription, error: subscriptionError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', currentSession.user.id)
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

        // Fetch initial counts and times
        await Promise.all([
          fetchDocumentCount(currentSession.user.id),
          fetchAverageProcessingTime(currentSession.user.id)
        ]);
      } catch (error) {
        console.error('Auth check error:', error);
        toast.error("Authentication error");
        navigate("/login");
      }
    };

    checkAuth();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        navigate("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Set up real-time subscription for document and message changes
  useEffect(() => {
    if (!session?.user?.id) return;

    const documentChannel = supabase
      .channel('document-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
          filter: `user_id=eq.${session.user.id}`
        },
        () => {
          fetchDocumentCount(session.user.id);
        }
      )
      .subscribe();

    const messageChannel = supabase
      .channel('message-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `user_id=eq.${session.user.id}`
        },
        () => {
          fetchAverageProcessingTime(session.user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(documentChannel);
      supabase.removeChannel(messageChannel);
    };
  }, [session]);

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate("/login");
    } catch (error) {
      console.error('Sign out error:', error);
      toast.error("Error signing out");
    }
  };

  // Don't render anything until we have a session
  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <Button variant="outline" onClick={handleSignOut}>Sign Out</Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
              <File className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{documentCount}</div>
              <p className="text-xs text-muted-foreground">Documents uploaded</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processing Time</CardTitle>
              <BarChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {averageProcessingTime ? `${averageProcessingTime}s` : 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground">Average processing time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Status</CardTitle>
              <Settings className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Active</div>
              <p className="text-xs text-muted-foreground">All systems operational</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="documents" className="space-y-4">
          <TabsList>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
          </TabsList>

          <TabsContent value="documents">
            <DocumentSection />
          </TabsContent>

          <TabsContent value="chat">
            <ChatSection />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Dashboard;