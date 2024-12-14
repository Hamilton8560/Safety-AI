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
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
    const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      throw new Error('Missing Stripe secret key or webhook secret');
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Get the signature from the header
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      throw new Error('No signature provided');
    }

    // Get the raw body
    const body = await req.text();
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error(`Webhook signature verification failed:`, err.message);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Processing webhook event:', event.type);

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Handle subscription-related events
    if (event.type.startsWith('customer.subscription')) {
      const subscription = event.data.object;
      console.log('Processing subscription:', subscription.id);

      // Get customer email from Stripe
      const customer = await stripe.customers.retrieve(subscription.customer as string);
      if (!customer || customer.deleted) {
        throw new Error('Customer not found or deleted');
      }

      console.log('Found customer:', customer.id);

      // Get user from profiles table using email
      const { data: users, error: userError } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('email', customer.email)
        .single();

      if (userError) {
        console.error('Error fetching user:', userError);
        throw userError;
      }

      if (!users) {
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
        status: 400
      }
    );
  }
});