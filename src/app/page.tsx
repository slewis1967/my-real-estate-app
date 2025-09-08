"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UploadCloud, CheckCircle, XCircle } from "lucide-react";

interface NotificationProps {
  message: string;
  type: 'success' | 'error';
  onDismiss: () => void;
}

function Notification({ message, type, onDismiss }: NotificationProps) {
  const bgColor = type === 'success' ? 'bg-green-50' : 'bg-red-50';
  const textColor = type === 'success' ? 'text-green-800' : 'text-red-800';
  const borderColor = type === 'success' ? 'border-green-200' : 'border-red-200';
  const Icon = type === 'success' ? CheckCircle : XCircle;

  return (
    <div className={`p-4 mt-4 rounded-md border ${bgColor} ${textColor} ${borderColor} flex items-start gap-3`}>
      <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-medium">{message}</p>
      </div>
      <button 
        onClick={onDismiss} 
        className="text-current hover:text-opacity-75 text-lg font-bold"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
