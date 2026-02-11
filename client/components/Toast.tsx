import { CheckCircle, AlertCircle, X } from 'lucide-react';
import { useEffect } from 'react';
import clsx from 'clsx';

export type ToastType = 'success' | 'error';

interface Props {
    show: boolean;
    message: string;
    type: ToastType;
    onClose: () => void;
}

export function Toast({ show, message, type, onClose }: Props) {
    useEffect(() => {
        if (show) {
            const timer = setTimeout(onClose, 3000);
            return () => clearTimeout(timer);
        }
    }, [show, onClose]);

    if (!show) return null;

    return (
        <div className={clsx(
            "fixed bottom-8 right-8 z-50 flex items-center gap-3 px-6 py-4 rounded-lg shadow-2xl transition-all duration-300 animate-slide-up",
            type === 'success' ? "bg-green-600 text-white" : "bg-red-600 text-white"
        )}>
            {type === 'success' ? <CheckCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
            <span className="font-medium text-lg">{message}</span>
            <button onClick={onClose} className="ml-4 opacity-80 hover:opacity-100">
                <X className="w-5 h-5" />
            </button>
        </div>
    );
}
