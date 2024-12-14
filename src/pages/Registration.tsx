import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const Registration = () => {
  const navigate = useNavigate();

  const checkSubscription = async (session: any) => {
    try {
      console.log('Checking subscription for session:', session.user.id);
      
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        body: { userId: session.user.id },
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      console.log('Subscription check response:', data, error);

      if (error) throw error;

      if (!data.subscribed) {
        console.log('No subscription found, creating checkout');
        const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke('create-checkout', {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
        });

        if (checkoutError) throw checkoutError;

        if (checkoutData?.url) {
          window.location.href = checkoutData.url;
        } else {
          throw new Error('No checkout URL received');
        }
      } else {
        navigate("/");
      }
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || "Failed to process subscription");
      // Don't navigate away on error, let user try again
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        checkSubscription(session);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">Create an Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Auth
            supabaseClient={supabase}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#2563eb',
                    brandAccent: '#1d4ed8',
                  },
                },
              },
            }}
            providers={[]}
            redirectTo={window.location.origin}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default Registration;