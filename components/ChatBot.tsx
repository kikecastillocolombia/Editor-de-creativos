
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from 'react';
import { ChatIcon, CloseIcon, SendIcon, PaperClipIcon } from './icons';

interface Message {
    id: number;
    text: string;
    sender: 'user' | 'bot';
    image?: string; // Base64 data or URL
}

const WEBHOOK_URL = 'https://n8n.calmessimple.com.ar/webhook/0077531d-0be0-475e-b632-8df0532b5b76';

// Helper component for message avatars
const Avatar: React.FC<{ sender: 'user' | 'bot' }> = ({ sender }) => (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${sender === 'bot' ? 'bg-gradient-to-br from-blue-500 to-cyan-400' : 'bg-gray-600'}`}>
        {sender === 'bot' ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
            </svg>
        ) : (
             <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
        )}
    </div>
);

// Formats message to handle basic markdown links and images
const formatMessage = (text: string): React.ReactNode => {
    // Regex for markdown images: ![alt](url)
    const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
    // Regex for standalone URLs ending in image extensions
    const rawImageRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/gi;
    // Regex for other markdown links: [text](url)
    const linkRegex = /\[(.*?)\]\((.*?)\)/g;
    
    // Split by markdown images first
    const parts = text.split(imageRegex);
    
    // If we have matches, parts will be [text, alt, url, text, alt, url...]
    if (parts.length > 1) {
        return parts.map((part, index) => {
            // Logic to determine if this part is an alt text or url based on modulo
            // This simple split is tricky. Let's use a simpler replacement strategy with components
            return <span key={index}>{part}</span> // Placeholder for complex logic, but let's stick to simple replacement below
        });
    }

    // Easier approach: render text and replace patterns
    const elements: (string | React.ReactNode)[] = [];
    let lastIndex = 0;
    
    // Replace raw image URLs with <img> tags
    text = text.replace(rawImageRegex, '![$1]($1)');

    // Process the text for markdown images
    text.replace(imageRegex, (match, alt, url, offset) => {
        if (offset > lastIndex) {
            elements.push(text.slice(lastIndex, offset));
        }
        elements.push(
            <a key={offset} href={url} target="_blank" rel="noopener noreferrer" className="block my-2">
                <img src={url} alt={alt} className="rounded-lg max-w-full border border-gray-700 hover:opacity-90 transition-opacity" />
            </a>
        );
        lastIndex = offset + match.length;
        return match;
    });

    if (lastIndex < text.length) {
        let remaining = text.slice(lastIndex);
        // Process standard links in remaining text
        const linkParts: (string | React.ReactNode)[] = [];
        let linkLastIndex = 0;
        
        remaining.replace(linkRegex, (match, linkText, url, offset) => {
             if (offset > linkLastIndex) {
                linkParts.push(remaining.slice(linkLastIndex, offset));
            }
            linkParts.push(
                <a key={offset} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                    {linkText}
                </a>
            );
            linkLastIndex = offset + match.length;
            return match;
        });
        
        if (linkLastIndex < remaining.length) {
            linkParts.push(remaining.slice(linkLastIndex));
        }
        
        elements.push(...linkParts);
    }

    return <>{elements}</>;
};

const ChatBot: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([
        { id: 0, text: '¡Hola! Soy tu asistente de CalmEditor. ¿En qué puedo ayudarte hoy?', sender: 'bot' }
    ]);
    const [inputText, setInputText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [attachment, setAttachment] = useState<File | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Generate a unique session ID for this conversation instance and persist it
    const [sessionId] = useState(() => {
        const storedSessionId = localStorage.getItem('calmEditorSessionId');
        if (storedSessionId) {
            return storedSessionId;
        }
        
        const newSessionId = typeof crypto !== 'undefined' && crypto.randomUUID 
            ? crypto.randomUUID() 
            : `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            
        localStorage.setItem('calmEditorSessionId', newSessionId);
        return newSessionId;
    });

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isOpen, attachment]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setAttachment(e.target.files[0]);
        }
        // Reset input value to allow selecting the same file again if needed
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleRemoveAttachment = () => {
        setAttachment(null);
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();

        if (!inputText.trim() && !attachment) return;

        setIsLoading(true);

        // Convert image to base64 if present
        let base64Image: string | undefined = undefined;
        if (attachment) {
            try {
                base64Image = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(attachment);
                });
            } catch (err) {
                console.error("Error reading file", err);
                // Continue without image or handle error
            }
        }

        const userMessage: Message = {
            id: Date.now(),
            text: inputText,
            sender: 'user',
            image: base64Image
        };

        setMessages(prev => [...prev, userMessage]);
        setInputText('');
        setAttachment(null);

        try {
            const payload: any = { 
                message: userMessage.text || (base64Image ? "Image uploaded" : ""),
                sessionId: sessionId 
            };
            
            if (base64Image) {
                payload.image = base64Image;
            }

            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            let botResponseText = 'Lo siento, no pude procesar tu solicitud.';

            if (response.ok) {
                const contentType = response.headers.get("content-type");
                
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const data = await response.json();
                    let extractedText = null;

                    if (Array.isArray(data) && data.length > 0) {
                        const firstItem = data[0];
                        extractedText = firstItem.output || firstItem.text || firstItem.message || firstItem.response;
                        if (!extractedText && typeof firstItem === 'string') {
                            extractedText = firstItem;
                        }
                    } else if (typeof data === 'object' && data !== null) {
                        extractedText = data.output || data.text || data.message || data.response;
                    }

                    botResponseText = extractedText || (typeof data === 'string' ? data : JSON.stringify(data));

                } else {
                    botResponseText = await response.text();
                }
            } else {
                botResponseText = `Error de conexión: ${response.status}`;
            }

            // Cleanup JSON-like strings
            if (typeof botResponseText === 'string' && (botResponseText.startsWith('[') || botResponseText.startsWith('{'))) {
                 try {
                     const parsed = JSON.parse(botResponseText);
                     if (Array.isArray(parsed) && parsed[0]?.output) {
                         botResponseText = parsed[0].output;
                     } else if (parsed.output) {
                         botResponseText = parsed.output;
                     }
                 } catch (e) {
                     // ignore
                 }
            }

            const botMessage: Message = {
                id: Date.now() + 1,
                text: botResponseText,
                sender: 'bot'
            };
            setMessages(prev => [...prev, botMessage]);

        } catch (error) {
            console.error('Chatbot error:', error);
            const errorMessage: Message = {
                id: Date.now() + 1,
                text: 'Lo siento, hubo un problema al conectar con el servidor.',
                sender: 'bot'
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {/* Chat Window */}
            {isOpen && (
                <div className="mb-4 w-80 sm:w-96 h-[550px] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up ring-1 ring-white/10">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-4 border-b border-gray-700 flex justify-between items-center shadow-sm">
                        <div className="flex items-center gap-3">
                             <div className="relative">
                                 <div className="bg-gradient-to-br from-blue-500 to-cyan-400 p-1.5 rounded-full">
                                    <ChatIcon className="w-5 h-5 text-white" />
                                 </div>
                                 <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-gray-900 rounded-full"></div>
                             </div>
                             <div>
                                 <h3 className="font-bold text-gray-100 text-sm">Asistente CalmEditor</h3>
                                 <p className="text-xs text-green-400 font-medium">En línea</p>
                             </div>
                        </div>
                        <button 
                            onClick={() => setIsOpen(false)}
                            className="text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 p-1.5 rounded-full"
                        >
                            <CloseIcon className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-900/95 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                        {messages.map((msg) => (
                            <div 
                                key={msg.id} 
                                className={`flex gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                            >
                                <Avatar sender={msg.sender} />
                                <div 
                                    className={`max-w-[75%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                        msg.sender === 'user' 
                                            ? 'bg-blue-600 text-white rounded-tr-none' 
                                            : 'bg-gray-800 text-gray-200 border border-gray-700 rounded-tl-none'
                                    }`}
                                >
                                    {msg.image && (
                                        <div className="mb-2 rounded-lg overflow-hidden border border-white/20">
                                            <img src={msg.image} alt="Adjunto" className="w-full h-auto object-cover" />
                                        </div>
                                    )}
                                    {msg.sender === 'bot' ? formatMessage(msg.text) : msg.text}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex gap-3">
                                <Avatar sender="bot" />
                                <div className="bg-gray-800 p-4 rounded-2xl rounded-tl-none border border-gray-700 flex items-center gap-2">
                                   <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                   <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                   <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Preview Area */}
                    {attachment && (
                        <div className="px-4 py-2 bg-gray-800/80 border-t border-gray-700 flex items-center justify-between">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-10 h-10 rounded bg-gray-700 overflow-hidden flex-shrink-0 border border-gray-600">
                                    <img src={URL.createObjectURL(attachment)} alt="Preview" className="w-full h-full object-cover" />
                                </div>
                                <span className="text-xs text-gray-300 truncate max-w-[150px]">{attachment.name}</span>
                            </div>
                            <button 
                                onClick={handleRemoveAttachment}
                                className="text-gray-400 hover:text-red-400 transition-colors p-1"
                            >
                                <CloseIcon className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* Input Area */}
                    <form onSubmit={handleSendMessage} className="p-4 bg-gray-800 border-t border-gray-700 flex gap-2 items-center">
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept="image/*"
                            onChange={handleFileSelect}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className={`p-2 rounded-lg transition-colors ${attachment ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                            title="Adjuntar imagen"
                        >
                            <PaperClipIcon className="w-5 h-5" />
                        </button>
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder={attachment ? "Añadir un comentario..." : "Escribe tu mensaje..."}
                            className="flex-grow bg-gray-900 border border-gray-700 text-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder-gray-500"
                        />
                        <button
                            type="submit"
                            disabled={isLoading || (!inputText.trim() && !attachment)}
                            className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none hover:scale-105 active:scale-95"
                        >
                            <SendIcon className="w-5 h-5" />
                        </button>
                    </form>
                </div>
            )}

            {/* Floating Bubble Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`p-4 rounded-full shadow-2xl transition-all duration-300 transform hover:scale-110 active:scale-95 border border-white/10 ${
                    isOpen 
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 rotate-90' 
                        : 'bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-blue-500/40'
                }`}
            >
                {isOpen ? <CloseIcon className="w-7 h-7" /> : <ChatIcon className="w-7 h-7" />}
            </button>
        </div>
    );
};

export default ChatBot;
