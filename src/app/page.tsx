// app/page.tsx

"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, UploadCloud } from "lucide-react";

// A simple toast-like notification component
function Notification({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) {
  const bgColor = type === 'success' ? 'bg-green-100' : 'bg-red-100';
  const textColor = type === 'success' ? 'text-green-800' : 'text-red-800';
  return (
    <div className={`p-4 mt-4 rounded-md ${bgColor} ${textColor} flex justify-between items-center`}>
      <p>{message}</p>
      <button onClick={onDismiss} className="font-bold">X</button>
    </div>
  );
}


export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const supabase = createClientComponentClient();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
      setNotification(null);
    }
  };

  const handleImport = async () => {
    if (!file) {
      setNotification({ message: "Please select a PDF document to import.", type: 'error' });
      return;
    }

    setIsImporting(true);
    setNotification(null);
    const fileName = file.name;

    try {
      // 1. Upload the PDF to a temporary Supabase Storage bucket
      const { error: uploadError } = await supabase.storage
        .from("temp-uploads")
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`File upload failed: ${uploadError.message}`);
      }

      // Get the public URL of the uploaded file
      const { data: publicUrlData } = supabase.storage
        .from("temp-uploads")
        .getPublicUrl(fileName);
      
      const publicUrl = publicUrlData.publicUrl;

      // 2. Trigger the Supabase Edge Function
      const { data, error: functionError } = await supabase.functions.invoke('import-property', {
        body: { pdfUrl: publicUrl, fileName },
      });

      if (functionError) {
        throw new Error(functionError.message);
      }

      setNotification({ message: `Success! Property at ${data.property.address} imported.`, type: 'success' });

    } catch (err: any) {
      console.error("Import failed:", err);
      setNotification({ message: err.message || "An unknown error occurred.", type: 'error' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gray-50">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud size={24} /> AI Real Estate Importer
          </CardTitle>
          <CardDescription>
            Upload a real estate PDF document to automatically extract property details using AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pdf-upload">Upload PDF Document</Label>
            <Input id="pdf-upload" type="file" accept=".pdf" onChange={handleFileChange} />
          </div>
          
          <Button
            onClick={handleImport}
            disabled={!file || isImporting}
            className="w-full"
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              "Import Listing"
            )}
          </Button>
          {notification && (
            <Notification message={notification.message} type={notification.type} onDismiss={() => setNotification(null)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}