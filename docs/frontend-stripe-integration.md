# Frontend Pages Needed for Stripe

## Pages to Add

### /success
- Shows after successful payment
- Message: "Payment successful! Your blueprint is now unlocked."
- Has a button to go back to the location / dashboard
- URL will have `?session_id=...` query param (we use this later for verification)

### /cancel
- Shows if user cancels checkout
- Message: "Payment cancelled. No charge was made."
- Has a button to go back

### Location Detail Page
- "Get Free Scorecard" button (always visible)
- "Buy Full Blueprint — $299" button (shows Stripe checkout)
- If already purchased, show "View Blueprint" instead

## Notes
- Stripe handles the entire checkout/payment UI — no payment forms needed in our app
- We wire up the API calls after exporting the repo
- Test card: 4242 4242 4242 4242
