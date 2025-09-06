// supabase/functions/import-property/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.2";
import { Configuration, OpenAI } from "https://esm.sh/openai@4.52.7";
import * as pdfjs from "https://cdn.skypack.dev/pdfjs-dist/build/pdf.min.js";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { format as formatDate } from "https://esm.sh/date-fns@2.30.0";

// Define the expected output format for GPT-4o
const PROPERTY_JSON_SCHEMA = {
  address: "string",
  price: "number",
  bedrooms: "number",
  bathrooms: "number",
  car_spaces: "number",
  land_area_sqm: "number",
  house_area_sqm: "number",
  description: "string",
  features: "array<string>",
};

const openaiConfig = new Configuration({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});
const openai = new OpenAI(openaiConfig);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pdfUrl, fileName } = await req.json();

    if (!pdfUrl) {
      return new Response(JSON.stringify({ error: "PDF URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Fetch the PDF and read its content
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    const pdfBytes = new Uint8Array(await response.arrayBuffer());

    // 2. Parse text and extract images from the PDF
    const pdfDocument = await PDFDocument.load(pdfBytes);
    let fullText = "";
    let extractedImages: Uint8Array[] = [];

    // Use a simpler approach for the Edge function, as pdfjs-dist requires a worker for full features
    // For this example, we'll focus on text parsing. For production, a custom worker setup is needed.
    const pdf = await pdfjs.getDocument({ data: pdfBytes }).promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map((item: any) => item.str).join(" ");
    }
    // Note: Image extraction requires a more complex setup with pdf.js. A simple solution is to rely on the AI's ability to describe from visual input, but for this specific request, we will demonstrate a simpler image extraction from PDF-LIB.
    // For now, we will assume image extraction logic is external or the AI can work without it. The code below is a placeholder.
    // const images = await extractImages(pdfDocument); // Placeholder for a separate image extraction function

    // 3. Use OpenAI GPT-4o to parse the text
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a highly specialized real estate data extraction bot. Your task is to parse the provided text from a real estate property PDF and extract key details into a structured JSON format. The text may be messy, so you must be intelligent about identifying the correct information. The output must strictly adhere to the following JSON schema: ${JSON.stringify(PROPERTY_JSON_SCHEMA, null, 2)}
          - 'price' should be a numeric value only (e.g., 1250000, not '$1.25M').
          - 'description' should be a single paragraph of text describing the property.
          - 'features' should be an array of key selling points or amenities.
          - If a field is not found, use a reasonable default or null.
          `,
        },
        {
          role: "user",
          content: fullText,
        },
      ],
      response_format: { type: "json_object" },
    });

    const propertyData = JSON.parse(completion.choices[0].message.content || "{}");

    // 4. Upload PDF and images to Supabase Storage
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") as string,
      Deno.env.get("SUPABASE_ANON_KEY") as string,
    );
    
    // Upload the source PDF
    const timestamp = formatDate(new Date(), "yyyyMMdd_HHmmss");
    const sourcePath = `documents/${timestamp}_${fileName}`;
    const { data: documentUpload, error: docError } = await supabase.storage
      .from("property-assets")
      .upload(sourcePath, pdfBytes, {
        cacheControl: "3600",
        upsert: false,
      });

    if (docError) throw new Error(`Storage upload error: ${docError.message}`);
    const sourcePdfUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/property-assets/${sourcePath}`;

    // Placeholder for image uploads. A full implementation would use GPT-4o with Vision to identify the facade and floor plan images from a collection of extracted images.
    // For this demonstration, we'll assume the URLs are derived or hardcoded.
    // const facadePath = `images/${propertyData.address}_facade.jpg`;
    // const { data: facadeUpload } = await supabase.storage.from('property-assets').upload(facadePath, facadeImageBytes);
    const facade_image_url = "https://example.com/placeholder_facade.jpg";
    const floor_plan_image_url = "https://example.com/placeholder_floorplan.jpg";
    const image_gallery_urls: string[] = [];

    // 5. Insert data into the Supabase database
    const { data, error } = await supabase
      .from("properties")
      .insert({
        address: propertyData.address,
        price: propertyData.price,
        bedrooms: propertyData.bedrooms,
        bathrooms: propertyData.bathrooms,
        car_spaces: propertyData.car_spaces,
        land_area_sqm: propertyData.land_area_sqm,
        house_area_sqm: propertyData.house_area_sqm,
        description: propertyData.description,
        features: propertyData.features,
        status: "imported",
        facade_image_url,
        floor_plan_image_url,
        image_gallery_urls,
        document_urls: { source_pdf: sourcePdfUrl },
        source_pdf_name: fileName,
      })
      .select()
      .single();

    if (error) throw new Error(`Database insert error: ${error.message}`);

    return new Response(JSON.stringify({ success: true, property: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});