'use client';
import { useState } from 'react';

export default function FlashcardChat() {
    // State to hold the conversation history
    const [conversation, setConversation] = useState([
        {
            role: 'system',
            content:
                "You are an assistant who specializes in helping middle-school kids with studying, while they use an advanced Flashcard application. When the user has a question, you will be given the exact flashcard they are currently working on, which will include various resources they may or may not have already seen.\n\nTypically, you can assume that they are coming to you because the various resources, including the answer, detailed explanation, and the audio explanation didn't help. However, if there is something important that can be reviewed in those sections, it's ok to reword them. But your true expertise will be in teaching the topic using simple words, but from an angle that is not already covered.\n\nDo your best to guide them and in case they ask you about something other than this specific flashcard, you can remind them that if they go to that specific flashcard and then ask you for help, you can be even more helpful, but assist them anyways.\n\nRemember, middle school kids are between 11-13 years old so most of the topics they need help with are totally new to them. Try to use a simple and direct response to their question and ALWAYS end your response by either offering them another specific aspect of the topic to explore or asking them which parts are still difficult to understand so they are encouraged to keep talking to you.",
        },
    ]);

    const [inputMessage, setInputMessage] = useState(''); // User input
    const [loading, setLoading] = useState(false); // Loading state for API call

    // Function to handle user message submission
    const handleSendMessage = async () => {
        if (!inputMessage.trim()) return; // Prevent sending empty messages

        setLoading(true);

        const userMessage = {
            role: 'user',
            content: inputMessage,
        };

        // Add user message to conversation
        const updatedConversation = [...conversation, userMessage];
        setConversation(updatedConversation); // Update conversation state

        try {
            const response = await fetch('/api/openai-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: updatedConversation,
                }),
            });

            const data = await response.json();

            const aiResponse = {
                role: 'assistant',
                content: data.content, // OpenAI API response content
            };

            // Update conversation with AI response
            setConversation((prevConversation) => [...prevConversation, aiResponse]);
        } catch (error) {
            console.error('Error fetching AI response:', error);
        } finally {
            setLoading(false);
            setInputMessage(''); // Clear input after sending
        }
    };

    return (
        <div className="p-4 max-w-md mx-auto">
            <div className="bg-gray-100 p-4 rounded-lg shadow-md mb-4">
                <h2 className="text-lg font-semibold">AI Study Assistant</h2>
                <div className="h-64 overflow-y-scroll bg-white p-3 rounded-lg mb-4">
                    {conversation.slice(1).map((msg, index) => (
                        <div
                            key={index}
                            className={`p-2 my-2 rounded-lg ${
                                msg.role === 'user' ? 'bg-blue-100 text-right' : 'bg-green-100'
                            }`}
                        >
                            <p>{msg.content}</p>
                        </div>
                    ))}
                </div>
                <div className="flex">
                    <input
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        placeholder="Type your message..."
                        className="flex-grow p-2 border rounded-l-lg"
                    />
                    <button
                        onClick={handleSendMessage}
                        className="bg-blue-500 text-white p-2 rounded-r-lg"
                        disabled={loading}
                    >
                        {loading ? 'Sending...' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    );
}
