import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSessionStatus } from '@/lib/api';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<'loading' | 'paid' | 'pending'>('loading');
  const [locationId, setLocationId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus('paid'); // No session = direct visit, just show success
      return;
    }
    getSessionStatus(sessionId)
      .then(res => {
        setStatus(res.paid ? 'paid' : 'pending');
        if (res.location_id) setLocationId(res.location_id);
      })
      .catch(() => setStatus('paid'));
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        {status === 'loading' ? (
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
        ) : (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-[hsl(var(--success))]/15 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-[hsl(var(--success))]" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-foreground font-mono">Payment Successful!</h1>
              <p className="text-sm text-muted-foreground">
                Your blueprint is now unlocked.
                {locationId && <> Location: <strong>{locationId}</strong></>}
              </p>
            </div>
            <Button onClick={() => navigate('/atlas')} className="w-full gap-2">
              <ArrowRight className="w-4 h-4" /> Go to Atlas
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
