import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCard, AlertCircle, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import skylyLogo from '@/assets/skyly-logo.png';

type Status = 'idle' | 'processing' | 'success' | 'error';

export default function Payment() {
  const navigate = useNavigate();
  const location = useLocation();
  const signupState = location.state as Record<string, string> | null;

  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!cardNumber || !expiry || !cvc) {
      setErrorMsg('Please fill in all card details.');
      return;
    }

    setStatus('processing');

    // Simulate payment processing
    setTimeout(() => {
      // Simulate failure if card number starts with 0
      if (cardNumber.startsWith('0')) {
        setStatus('error');
        setErrorMsg('Payment declined. Please check your card details and try again.');
      } else {
        setStatus('success');
      }
    }, 1800);
  };

  const handleBack = () => {
    navigate('/signup', { state: signupState });
  };

  const handleContinue = () => {
    navigate('/signup', { state: { ...signupState, stripeConnected: 'true' } });
  };

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-[hsl(var(--success))]/15 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-[hsl(var(--success))]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground font-mono uppercase tracking-wide">Payment Connected</h1>
            <p className="text-sm text-muted-foreground">
              Your payment method has been successfully verified.
            </p>
          </div>
          <Button onClick={handleContinue} className="w-full">
            Continue to Account Setup
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <img src={skylyLogo} alt="Skyly" className="w-14 h-14 rounded-xl" />
          <h1 className="text-xl font-semibold text-foreground font-mono uppercase tracking-wide">Payment Details</h1>
          <p className="text-sm text-muted-foreground text-center">
            Connect a payment method to activate your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {(errorMsg || status === 'error') && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cardNumber">Card Number</Label>
            <Input
              id="cardNumber"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="4242 4242 4242 4242"
              disabled={status === 'processing'}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="expiry">Expiry</Label>
              <Input
                id="expiry"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                placeholder="MM / YY"
                disabled={status === 'processing'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cvc">CVC</Label>
              <Input
                id="cvc"
                value={cvc}
                onChange={(e) => setCvc(e.target.value)}
                placeholder="123"
                disabled={status === 'processing'}
              />
            </div>
          </div>

          <Button type="submit" className="w-full gap-2" disabled={status === 'processing'}>
            {status === 'processing' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                Verify Payment
              </>
            )}
          </Button>
        </form>

        <button
          type="button"
          onClick={handleBack}
          disabled={status === 'processing'}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mx-auto disabled:opacity-50"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Create Account
        </button>
      </div>
    </div>
  );
}
