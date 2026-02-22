import { useNavigate } from 'react-router-dom';
import { XCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PaymentCancel() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/15 flex items-center justify-center">
          <XCircle className="w-8 h-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">Payment Cancelled</h1>
          <p className="text-sm text-muted-foreground">
            No charge was made. You can try again anytime.
          </p>
        </div>
        <Button onClick={() => navigate('/atlas')} variant="outline" className="w-full gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Atlas
        </Button>
      </div>
    </div>
  );
}
