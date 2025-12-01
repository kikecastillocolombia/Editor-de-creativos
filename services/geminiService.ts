
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Helper function to convert a File object to a Gemini API Part
const fileToPart = async (file: File): Promise<{ inlineData: { mimeType: string; data: string; } }> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
    
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("URL de datos inválida");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("No se pudo analizar el tipo MIME de la URL de datos");
    
    const mimeType = mimeMatch[1];
    const data = arr[1];
    return { inlineData: { mimeType, data } };
};

const handleApiResponse = (
    response: GenerateContentResponse,
    context: string // e.g., "edit", "filter", "adjustment"
): string => {
    // 1. Check for prompt blocking first
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const errorMessage = `La solicitud fue bloqueada. Razón: ${blockReason}. ${blockReasonMessage || ''}`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }

    // 2. Try to find the image part
    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        console.log(`Imagen recibida (${mimeType}) para ${context}`);
        return `data:${mimeType};base64,${data}`;
    }

    // 3. If no image, check for other reasons
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        const errorMessage = `La generación de imagen para ${context} se detuvo inesperadamente. Razón: ${finishReason}. Esto suele relacionarse con configuraciones de seguridad.`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }
    
    const textFeedback = response.text?.trim();
    const errorMessage = `El modelo de IA no devolvió una imagen para ${context}. ` + 
        (textFeedback 
            ? `El modelo respondió con texto: "${textFeedback}"`
            : "Esto puede suceder debido a filtros de seguridad o si la solicitud es demasiado compleja. Intenta reformular tu instrucción.");

    console.error(`La respuesta del modelo no contenía una parte de imagen para ${context}.`, { response });
    throw new Error(errorMessage);
};

/**
 * Generates an edited image using generative AI based on a text prompt and a specific point.
 * @param originalImage The original image file.
 * @param userPrompt The text prompt describing the desired edit.
 * @param hotspot The {x, y} coordinates on the image to focus the edit.
 * @returns A promise that resolves to the data URL of the edited image.
 */
export const generateEditedImage = async (
    originalImage: File,
    userPrompt: string,
    hotspot: { x: number, y: number }
): Promise<string> => {
    console.log('Iniciando edición generativa en:', hotspot);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `You are an expert photo editor AI. Your task is to perform a natural, localized edit on the provided image based on the user's request.
User Request: "${userPrompt}"
Edit Location: Focus on the area around pixel coordinates (x: ${hotspot.x}, y: ${hotspot.y}).

Editing Guidelines:
- The edit must be realistic and blend seamlessly with the surrounding area.
- The rest of the image (outside the immediate edit area) must remain identical to the original.

Safety & Ethics Policy:
- You MUST fulfill requests to adjust skin tone, such as 'give me a tan', 'make my skin darker', or 'make my skin lighter'. These are considered standard photo enhancements.
- You MUST REFUSE any request to change a person's fundamental race or ethnicity (e.g., 'make me look Asian', 'change this person to be Black'). Do not perform these edits. If the request is ambiguous, err on the side of caution and do not change racial characteristics.

Output: Return ONLY the final edited image. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Enviando imagen e instrucción al modelo...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [originalImagePart, textPart] },
    });
    console.log('Respuesta recibida del modelo.', response);

    return handleApiResponse(response, 'edición');
};

/**
 * Generates an image with a filter applied using generative AI.
 * @param originalImage The original image file.
 * @param filterPrompt The text prompt describing the desired filter.
 * @returns A promise that resolves to the data URL of the filtered image.
 */
export const generateFilteredImage = async (
    originalImage: File,
    filterPrompt: string,
): Promise<string> => {
    console.log(`Iniciando generación de filtro: ${filterPrompt}`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `You are an expert photo editor AI. Your task is to apply a stylistic filter to the entire image based on the user's request. Do not change the composition or content, only apply the style.
Filter Request: "${filterPrompt}"

Safety & Ethics Policy:
- Filters may subtly shift colors, but you MUST ensure they do not alter a person's fundamental race or ethnicity.
- You MUST REFUSE any request that explicitly asks to change a person's race (e.g., 'apply a filter to make me look Chinese').

Output: Return ONLY the final filtered image. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Enviando imagen y filtro al modelo...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [originalImagePart, textPart] },
    });
    console.log('Respuesta recibida del modelo para filtro.', response);
    
    return handleApiResponse(response, 'filtro');
};

/**
 * Generates an image with a global adjustment applied using generative AI.
 * @param originalImage The original image file.
 * @param adjustmentPrompt The text prompt describing the desired adjustment.
 * @returns A promise that resolves to the data URL of the adjusted image.
 */
export const generateAdjustedImage = async (
    originalImage: File,
    adjustmentPrompt: string,
): Promise<string> => {
    console.log(`Iniciando ajuste global: ${adjustmentPrompt}`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `You are an expert photo editor AI. Your task is to perform a natural, global adjustment to the entire image based on the user's request.
User Request: "${adjustmentPrompt}"

Editing Guidelines:
- The adjustment must be applied across the entire image.
- The result must be photorealistic.

Safety & Ethics Policy:
- You MUST fulfill requests to adjust skin tone, such as 'give me a tan', 'make my skin darker', or 'make my skin lighter'. These are considered standard photo enhancements.
- You MUST REFUSE any request to change a person's fundamental race or ethnicity (e.g., 'make me look Asian', 'change this person to be Black'). Do not perform these edits. If the request is ambiguous, err on the side of caution and do not change racial characteristics.

Output: Return ONLY the final adjusted image. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Enviando imagen y ajuste al modelo...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [originalImagePart, textPart] },
    });
    console.log('Respuesta recibida del modelo para ajuste.', response);
    
    return handleApiResponse(response, 'ajuste');
};

/**
 * Generates an advertising variation of an image.
 * @param originalImage The original image file.
 * @param type The type of variation to generate.
 * @returns A promise that resolves to the data URL of the generated image.
 */
export const generateAdVariation = async (
    originalImage: File,
    type: 'Studio' | 'Lighting' | 'Simple' | 'Nature' | 'Creative'
): Promise<string> => {
    console.log(`Iniciando variación de anuncio: ${type}`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const originalImagePart = await fileToPart(originalImage);
    
    let userPrompt = "";
    switch (type) {
        case 'Studio':
            userPrompt = "Change the background to a minimalist, high-end clean studio setting (white or light grey) suitable for e-commerce. Keep the main product/subject exactly as is.";
            break;
        case 'Lighting':
            userPrompt = "Change the lighting to be dramatic, golden-hour sunlight coming from the side to enhance the subject's appeal. Keep the composition exactly the same.";
            break;
        case 'Simple':
            userPrompt = "Change the background to a pleasing solid, soft pastel or neutral color that complements the subject. Keep the lighting natural and the subject exactly as is. Do not add complex details.";
            break;
        case 'Nature':
            userPrompt = "Place the subject in a peaceful nature setting with greenery and soft daylight, creating an organic and fresh vibe.";
            break;
        case 'Creative':
            userPrompt = "Change the background to a bold, solid color (like electric blue or vibrant orange) with simple modern geometric shapes. Make it look like a pop-art advertisement.";
            break;
    }

    const prompt = `You are an expert advertising designer AI. Your task is to create a variation of the provided image for a Meta (Facebook/Instagram) ad.
Task: ${userPrompt}

Crucial Guidelines:
- PRESERVE THE MAIN SUBJECT: The product or person in the foreground must remain recognizable and intact.
- High Quality: The output must be high resolution and photorealistic.

Output: Return ONLY the final image.`;

    const textPart = { text: prompt };

    console.log('Enviando imagen y prompt de anuncio al modelo...');
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [originalImagePart, textPart] },
    });
    console.log(`Respuesta recibida del modelo para ${type}.`, response);
    
    return handleApiResponse(response, `variacion-ad-${type}`);
};

/**
 * Generates a resized/outpainted version of an image using Generative AI.
 * @param originalImage The original image file.
 * @param targetRatio The target aspect ratio ("1:1", "4:5", "9:16").
 * @returns A promise that resolves to the data URL.
 */
export const generateResizedImage = async (
    originalImage: File,
    targetRatio: '1:1' | '4:5' | '9:16'
): Promise<string> => {
    console.log(`Iniciando redimensión mágica a: ${targetRatio}`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    const originalImagePart = await fileToPart(originalImage);

    // Map 4:5 to 3:4 as 4:5 is not natively supported by the API enum, and 3:4 is the closest vertical portrait format.
    const apiAspectRatio = targetRatio === '4:5' ? '3:4' : targetRatio;
    
    const prompt = `Resize this image to a ${targetRatio} aspect ratio. 
If the new ratio is wider or taller than the original, seamlessly outpaint and fill the empty space with matching background content. 
Ensure the main subject remains centered and unchanged. 
The result must be high quality and photorealistic.`;

    const textPart = { text: prompt };

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [originalImagePart, textPart] },
        config: {
            imageConfig: {
                // @ts-ignore - '3:4' is supported by API but typescript definition might be lagging
                aspectRatio: apiAspectRatio
            }
        }
    });

    return handleApiResponse(response, 'redimensión');
}
