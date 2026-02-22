import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, AlertCircle, CreditCard, CheckCircle2 } from 'lucide-react';
import skylyLogo from '@/assets/skyly-logo.png';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const incoming = location.state as Record<string, string> | null;

  const [username, setUsername] = useState(incoming?.username ?? '');
  const [password, setPassword] = useState(incoming?.password ?? '');
  const [confirmPassword, setConfirmPassword] = useState(incoming?.confirmPassword ?? '');
  const [stripeConnected, setStripeConnected] = useState(incoming?.stripeConnected === 'true');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (!stripeConnected) {
      setError('Please connect your payment method before continuing.');
      return;
    }

    const ok = signup(username, password);
    if (ok) {
      navigate('/atlas');
    } else {
      setError('Username already taken.');
    }
  };

  const handleStripeConnect = () => {
    navigate('/payment', {
      state: { username, password, confirmPassword },
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3">
          <img src={skylyLogo} alt="Skyly" className="w-14 h-14 rounded-xl" />
          <h1 className="text-xl font-semibold text-foreground">Create your account</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Choose a username"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 4 characters"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
            />
          </div>

          {/* Stripe payment */}
          <div className="space-y-2">
            <Label>Payment Method</Label>
            {stripeConnected ? (
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--success))] bg-[hsl(var(--success))]/10 rounded-md p-3">
                <CheckCircle2 className="w-4 h-4" />
                Payment connected
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                onClick={handleStripeConnect}
              >
                <CreditCard className="w-4 h-4" />
                Connect with Stripe
              </Button>
            )}
          </div>

          <Button type="submit" className="w-full gap-2">
            <UserPlus className="w-4 h-4" />
            Create Account
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
