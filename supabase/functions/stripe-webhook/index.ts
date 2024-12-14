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
    const bodyBytes = new TextEncoder().encode(body);
    
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
        console.log('Processing subscription:', subscription);
        
        // Get customer details to find email
        const customer = await stripe.customers.retrieve(subscription.customer);
        console.log('Customer details:', customer);
        
        if (!customer.email) {
          throw new Error('No customer email found');
        }

        // Find user by email
        const { data: users, error: userError } = await supabaseClient
          .from('profiles')
          .select('id')
          .eq('email', customer.email)
          .single();

        if (userError) {
          console.error('Error finding user:', userError);
          throw userError;
        }

        if (!users) {
          console.error('No user found for email:', customer.email);
          throw new Error('User not found');
        }

        console.log('Found user:', users);

        // For subscription.deleted, we'll update the status to canceled
        const status = event.type === 'customer.subscription.deleted' 
          ? 'canceled' 
          : subscription.status;

        // Only proceed with active or canceled subscriptions
        if (status === 'incomplete' || status === 'incomplete_expired') {
          console.log(`Skipping ${status} subscription update`);
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        // Update subscriptions table
        const subscriptionData = {
          user_id: users.id,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: subscription.customer,
          status: status,
          price_id: subscription.items.data[0].price.id,
          updated_at: new Date().toISOString()
        };

        console.log('Updating subscription with data:', subscriptionData);

        // Try to update existing subscription first
        const { error: updateError } = await supabaseClient
          .from('subscriptions')
          .upsert(subscriptionData, {
            onConflict: 'user_id,stripe_subscription_id'
          });

        if (updateError) {
          console.error('Error updating subscription:', updateError);
          throw updateError;
        }

        console.log(`Subscription ${event.type} processed successfully for user ${users.id}`);
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