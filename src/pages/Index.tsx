import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, CheckCircle, Lock, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
     

      // Check if user has an active subscription
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('status', 'active')
        .limit(1); // Only get the most recent active subscription

      if (subscriptionError) {
        console.error('Error checking subscription:', subscriptionError);
        toast.error("Failed to check subscription status");
        return;
      }

      // If at least one active subscription exists, redirect to dashboard
      if (subscriptionData && subscriptionData.length > 0) {
        navigate("/dashboard");
        return;
      }

      // If no active subscription, redirect to register
      navigate("/register");
      toast.info("Please subscribe to continue");
    };

    checkAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-20 px-4 md:px-6 bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
              Compliance Made <span className="text-blue-600">Simple</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Streamline your compliance processes with AI-powered automation. Stay compliant, reduce risks, and focus on growing your business.
            </p>
            <div className="flex gap-4 justify-center">
              <Button size="lg" className="text-lg" asChild>
                <Link to="/register">Get Started</Link>
              </Button>
              <Button size="lg" variant="outline" className="text-lg">
                Learn More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Why Choose Our Platform
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            <FeatureCard
              icon={Shield}
              title="Advanced Security"
              description="Enterprise-grade security to protect your sensitive data"
            />
            <FeatureCard
              icon={CheckCircle}
              title="Easy Compliance"
              description="Automated compliance checks and real-time monitoring"
            />
            <FeatureCard
              icon={Lock}
              title="Data Privacy"
              description="GDPR and CCPA compliant data handling processes"
            />
            <FeatureCard
              icon={Users}
              title="Team Collaboration"
              description="Seamless collaboration tools for your entire team"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 md:px-6 bg-blue-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Transform Your Compliance Process?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Join thousands of companies that trust our platform for their compliance needs.
          </p>
          <Button size="lg" className="text-lg" asChild>
            <Link to="/register">Start Free Trial</Link>
          </Button>
        </div>
      </section>
    </div>
  );
};

const FeatureCard = ({ icon: Icon, title, description }: { icon: any; title: string; description: string }) => (
  <Card className="border-none shadow-lg">
    <CardContent className="pt-6">
      <div className="rounded-full bg-blue-100 p-3 w-12 h-12 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-blue-600" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </CardContent>
  </Card>
);

export default Index;
