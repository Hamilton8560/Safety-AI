import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();

  const checkSubscription = async (session: any) => {
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (error) throw error;

      if (!data.subscribed) {
        const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke('create-checkout', {
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
        });

        if (checkoutError) throw checkoutError;

        if (checkoutData.url) {
          window.location.href = checkoutData.url;
        }
      } else {
        navigate("/");
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error("Failed to process subscription");
      navigate("/");
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
          <CardTitle className="text-3xl">Welcome Back</CardTitle>
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
            view="sign_in"
            providers={[]}
            redirectTo={window.location.origin}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;