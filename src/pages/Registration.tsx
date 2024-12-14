import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const Registration = () => {
  const navigate = useNavigate();
  const [showSubscription, setShowSubscription] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    try {
      setLoading(true);
      const session = await supabase.auth.getSession();
      const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke('create-checkout', {
        headers: {
          Authorization: `Bearer ${session.data.session?.access_token}`,
        },
      });

      if (checkoutError) {
        console.error('Checkout error:', checkoutError);
        if (checkoutError.message.includes('already has an active subscription')) {
          toast.success('You already have an active subscription');
          navigate('/');
          return;
        }
        throw checkoutError;
      }

      if (checkoutData?.url) {
        window.open(checkoutData.url, '_blank');
        toast.info("Checkout opened in a new tab. Please complete your subscription there.");
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || "Failed to process subscription");
    } finally {
      setLoading(false);
    }
  };

  const checkSubscription = async (session: any) => {
    try {
      console.log('Checking subscription for session:', session.user.id);
      
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        body: { userId: session.user.id },
      });

      if (error) {
        console.error('Subscription check error:', error);
        throw error;
      }

      console.log('Subscription check response:', data, error);

      if (!data.subscribed) {
        setShowSubscription(true);
      } else {
        toast.success("Welcome back! Redirecting to dashboard...");
        navigate("/");
      }
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || "Failed to check subscription status");
      setShowSubscription(true); // Show subscription page on error as fallback
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

  if (showSubscription) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Subscribe to Continue</CardTitle>
            <CardDescription className="mt-2">
              Get access to all features with our premium subscription
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-lg mb-2">Premium Plan</h3>
              <ul className="space-y-2">
                <li className="flex items-center">
                  <span className="mr-2">✓</span> Full access to all features
                </li>
                <li className="flex items-center">
                  <span className="mr-2">✓</span> Priority support
                </li>
                <li className="flex items-center">
                  <span className="mr-2">✓</span> Regular updates
                </li>
              </ul>
              <p className="mt-4 font-semibold">$9.99/month</p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button 
              onClick={handleSubscribe}
              disabled={loading}
              className="w-full"
            >
              {loading ? "Processing..." : "Subscribe Now"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

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