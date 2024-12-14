import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from 'https://esm.sh/stripe@14.21.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2023-10-16',
    });

    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      throw new Error('No signature found in request');
    }

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    const body = await req.text();
    
    // Create a TextEncoder
    const encoder = new TextEncoder();
    // Encode the body string to Uint8Array
    const bodyBytes = encoder.encode(body);
    
    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        bodyBytes,
        signature,
        webhookSecret
      );
    } catch (err) {
      console.error('Error verifying webhook signature:', err);
      throw new Error('Invalid signature');
    }

    console.log(`Webhook event received: ${event.type}`);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerEmail = subscription.customer_email;
        
        if (customerEmail) {
          const { data: users, error: userError } = await supabaseClient
            .from('profiles')
            .select('id')
            .eq('email', customerEmail)
            .single();

          if (userError) {
            throw userError;
          }

          // Update subscriptions table
          const { error: subscriptionError } = await supabaseClient
            .from('subscriptions')
            .upsert({
              user_id: users.id,
              stripe_subscription_id: subscription.id,
              stripe_customer_id: subscription.customer,
              status: subscription.status,
              price_id: subscription.items.data[0].price.id,
              updated_at: new Date().toISOString()
            });

          if (subscriptionError) {
            throw subscriptionError;
          }

          console.log(`Subscription ${event.type} processed for user ${users.id}`);
        }
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});