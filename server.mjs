import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
// TODO: Replace this with new backend logic for conversations

// Load environment variables
dotenv.config();

// TODO: Replace this with new backend logic for conversations

const app = express();

app.get('/logs', (req, res) => {
    try {
        const logs = fs.readFileSync('chats.log', 'utf-8');
        res.type('text/plain').send(logs);
    } catch (err) {
        res.status(500).send('No log file found.');
    }
});

const port = process.env.PORT || 3000;

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Your OpenAI Assistant ID (replace with your actual assistant ID)
const ASSISTANT_ID = process.env.ASSISTANT_ID || 'asst_4SFRsyjO4SbH8JVaW46HEXWc';

// Middleware
app.use(cors({
    origin: '*', // Configure this for production
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'LegacyBot API is running' });
});

// Main chat endpoint
app.post('/api/chat', async (req, res) => {
    let conversationId = null;
    
    try {
        const { message, threadId } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Message is required and must be a string'
            });
        }

        let currentThreadId = threadId;
        let isNewConversation = false;

        // Create a new thread if one doesn't exist
        if (!currentThreadId) {
            const thread = await openai.beta.threads.create();
            currentThreadId = thread.id;
            isNewConversation = true;
        }

        // TODO: Replace this with new backend logic for conversations

        // Add the user's message to the thread
        await openai.beta.threads.messages.create(currentThreadId, {
            role: 'user',
            content: message,
        });

        // Run the assistant
        const run = await openai.beta.threads.runs.create(currentThreadId, {
            assistant_id: ASSISTANT_ID,
        });

        // Wait for the run to complete
        let runStatus = await openai.beta.threads.runs.retrieve(currentThreadId, run.id);
        
        while (runStatus.status === 'in_progress' || runStatus.status === 'queued') {
            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await openai.beta.threads.runs.retrieve(currentThreadId, run.id);
        }

        if (runStatus.status === 'completed') {
            // Get all messages from the thread
            const allMessages = await openai.beta.threads.messages.list(currentThreadId);
            const sortedMessages = allMessages.data.sort((a, b) => a.created_at - b.created_at);
            
            // Get the latest assistant response
            const assistantMessage = sortedMessages
                .filter(msg => msg.role === 'assistant')
                .pop();

            if (assistantMessage && assistantMessage.content[0]) {
                const responseText = assistantMessage.content[0].text.value;
                
                // Prepare conversation data for Firebase
                const conversationMessages = sortedMessages.map(msg => ({
                    role: msg.role,
                    content: msg.content[0]?.text?.value || '',
                    timestamp: new Date(msg.created_at * 1000)
                }));

                // TODO: Replace this with new backend logic for conversations

                // Log chat to local file
                const chatLog = {
                    timestamp: new Date().toISOString(),
                    user: message,
                    assistant: responseText,
                    threadId: currentThreadId,
                };
                fs.appendFileSync('chats.log', JSON.stringify(chatLog) + '\n');
                
                res.json({
                    success: true,
                    message: responseText,
                    threadId: currentThreadId,
                });
            } else {
                throw new Error('No assistant response found');
            }
        } else if (runStatus.status === 'failed') {
            throw new Error(`Assistant run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
        } else {
            throw new Error(`Assistant run ended with status: ${runStatus.status}`);
        }

    } catch (error) {
        console.error('Chat API Error:', error);
        
        // TODO: Replace this with new backend logic for conversations
        
        // Return a user-friendly error message
        res.status(500).json({
            success: false,
            error: 'Error connecting to assistant.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Generate a conversation summary for completed chats
function generateConversationSummary(messages, userInfo) {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    
    return {
        totalMessages: messages.length,
        userMessages: userMessages.length,
        assistantMessages: assistantMessages.length,
        duration: messages.length > 1 ? 
            new Date(messages[messages.length - 1].timestamp) - new Date(messages[0].timestamp) : 0,
        hasContactInfo: !!(userInfo.email || userInfo.phone),
        topics: extractTopics(messages),
        leadQuality: assessLeadQuality(userInfo, messages)
    };
}

// Extract main topics from conversation
function extractTopics(messages) {
    const conversationText = messages.map(m => m.content).join(' ').toLowerCase();
    const topics = [];
    
    const topicKeywords = {
        'web_design': ['website', 'web design', 'site', 'design', 'homepage'],
        'branding': ['brand', 'logo', 'branding', 'identity', 'brand identity'],
        'ecommerce': ['store', 'shop', 'ecommerce', 'e-commerce', 'online store', 'sell'],
        'seo': ['seo', 'search', 'google', 'ranking', 'optimization'],
        'mobile': ['mobile', 'app', 'responsive', 'phone'],
        'maintenance': ['maintenance', 'support', 'update', 'hosting']
    };
    
    for (const [topic, keywords] of Object.entries(topicKeywords)) {
        if (keywords.some(keyword => conversationText.includes(keyword))) {
            topics.push(topic);
        }
    }
    
    return topics;
}

// Assess lead quality based on conversation
function assessLeadQuality(userInfo, messages) {
    let score = 0;
    const conversationText = messages.map(m => m.content).join(' ').toLowerCase();
    
    // Contact information
    if (userInfo.email) score += 30;
    if (userInfo.phone) score += 30;
    if (userInfo.name) score += 20;
    
    // Project indicators
    if (conversationText.includes('budget')) score += 15;
    if (conversationText.includes('timeline')) score += 15;
    if (conversationText.includes('project')) score += 10;
    
    // Engagement level
    const userMessageCount = messages.filter(m => m.role === 'user').length;
    if (userMessageCount >= 5) score += 10;
    if (userMessageCount >= 8) score += 10;
    
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Start the server
app.listen(port, () => {
    console.log(`LegacyBot server running on port ${port}`);
    console.log(`Health check: http://localhost:${port}/health`);
    console.log(`Chat API: http://localhost:${port}/api/chat`);
    
    if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️  WARNING: OPENAI_API_KEY not found in environment variables');
    }
    
    if (!process.env.ASSISTANT_ID) {
        console.warn('⚠️  WARNING: ASSISTANT_ID not found in environment variables');
    }
});

export default app;
