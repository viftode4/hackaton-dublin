# frozen_string_literal: true

class CreatePaymentLinkInput < Anthropic::BaseModel
  required :location_id, String
  required :location_name, String
  optional :customer_email, String
end

class CreatePaymentLink < Anthropic::BaseTool
  description "Create a Stripe payment link for purchasing a detailed data center blueprint. Use this when a user wants to buy a full feasibility blueprint for a specific location. Returns a payment URL the user can click to complete the purchase ($299)."

  input_schema CreatePaymentLinkInput

  BLUEPRINT_PRICE_CENTS = 29900

  def call(input)
    unless ENV['STRIPE_SECRET_KEY'].present?
      return { error: 'Stripe not configured', message: 'Payment processing is not available in this environment.' }.to_json
    end

    location = LocationService.find(input.location_id)
    return { error: "Location '#{input.location_id}' not found." }.to_json unless location

    # Create a Stripe Checkout Session
    session_params = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: "Data Center Feasibility Blueprint",
              description: "Comprehensive blueprint for #{input.location_name} — includes site analysis, cost projections, risk assessment, and implementation timeline.",
              metadata: { location_id: input.location_id }
            },
            unit_amount: BLUEPRINT_PRICE_CENTS
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      metadata: {
        location_id: input.location_id,
        customer_id: input.respond_to?(:customer_email) && input.customer_email.present? ? input.customer_email : 'anonymous',
        user_email: input.respond_to?(:customer_email) ? input.customer_email : nil
      },
      success_url: ENV['STRIPE_SUCCESS_URL'] || 'https://orbital-atlas.app/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: ENV['STRIPE_CANCEL_URL'] || 'https://orbital-atlas.app/cancel'
    }

    if input.respond_to?(:customer_email) && input.customer_email.present?
      session_params[:customer_email] = input.customer_email
    end

    session = Stripe::Checkout::Session.create(session_params)

    {
      payment_url: session.url,
      session_id: session.id,
      location_id: input.location_id,
      location_name: input.location_name,
      amount: "$#{(BLUEPRINT_PRICE_CENTS / 100.0).round(2)}",
      message: "Payment link created! The user can complete their blueprint purchase at the URL above."
    }.to_json
  rescue Stripe::StripeError => e
    { error: "Stripe error: #{e.message}" }.to_json
  end
end
