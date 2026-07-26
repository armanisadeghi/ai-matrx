// import React from 'react';
// import {useSelector, useDispatch} from 'react-redux';
// import {motion, AnimatePresence} from 'motion/react';
// import {Card, CardContent} from "@/components/ui/card";
// import {Button} from "@/components/ui/button";
// import {X} from 'lucide-react';
// import {RootState} from '@/lib/redux/store';
// import {useAiChat} from "../hooks/useAiChat";
// import {addMessage} from "@/lib/redux/slices/flashcardChatSlice";
// import PromptInputWithActions from './PromptInputWithActions';
// import {selectFlashcardById} from '@/lib/redux/selectors/flashcardSelectors';
//
// interface ExpandedFlashcardWithChatProps {
//     isOpen: boolean;
//     onClose: () => void;
//     cardId: string | undefined;
//     firstName: string | null;
//     fontSize: number;
// }
//
// const ExpandedFlashcardWithChat: React.FC<ExpandedFlashcardWithChatProps> = (
//     {
//         isOpen,
//         onClose,
//         cardId,
//         firstName,
//         fontSize
//     }) => {
//     const card = useSelector(cardId ? selectFlashcardById(cardId) : () => null);
//
//     if (!card) {
//         return null;
//     }
//
//     const dispatch = useDispatch();
//     const chatMessages = useSelector((state: RootState) => state.flashcardChat[card.id]?.chat || []);
//     const {isLoading, streamingMessage, sendInitialMessage, sendMessage} = useAiChat();
//
//     React.useEffect(() => {
//         if (isOpen && chatMessages.length === 0) {
//             sendInitialMessage(card, firstName, (content) => {
//                 dispatch(addMessage({flashcardId: card.id, message: {role: 'assistant', content}}));
//             });
//         }
//     }, [isOpen, card, firstName, chatMessages.length, sendInitialMessage, dispatch]);
//
//     const handleSendMessage = (message: string) => {
//         dispatch(addMessage({flashcardId: card.id, message: {role: 'user', content: message}}));
//         sendMessage(message, card.id, (content) => {
//             dispatch(addMessage({flashcardId: card.id, message: {role: 'assistant', content}}));
//         });
//     };
//
//     return (
//         <AnimatePresence>
//             {isOpen && (
//                 <motion.div
//                     initial={{opacity: 0, scale: 0.8}}
//                     animate={{opacity: 1, scale: 1}}
//                     exit={{opacity: 0, scale: 0.8}}
//                     transition={{duration: 0.3}}
//                     className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
//                 >
//                     <motion.div
//                         className="w-full h-full max-w-6xl bg-zinc-900 rounded-lg shadow-xl overflow-hidden"
//                         layoutId="expandable-card"
//                     >
//                         <Card className="h-full flex flex-col">
//                             <CardContent className="flex-grow flex flex-col p-6 overflow-hidden">
//                                 <div className="mb-4 flex-shrink-0">
//                                     <h2 className="text-2xl font-bold mb-2">Question:</h2>
//                                     <p className="text-white" style={{fontSize: `${fontSize}px`}}>{card.front}</p>
//                                 </div>
//                                 <div className="mb-4 flex-shrink-0">
//                                     <h2 className="text-2xl font-bold mb-2">Answer:</h2>
//                                     <p className="text-white" style={{fontSize: `${fontSize}px`}}>{card.back}</p>
//                                 </div>
//                                 <div className="flex-grow overflow-auto mt-4 border-t border-zinc-700 pt-4 mb-4">
//                                     {chatMessages.map((msg, index) => (
//                                         <div key={index}
//                                              className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
//                                             <span
//                                                 className={`inline-block p-2 rounded ${msg.role === 'user' ? 'bg-blue-600' : 'bg-zinc-700'}`}>
//                                                 {msg.content}
//                                             </span>
//                                         </div>
//                                     ))}
//                                     {streamingMessage && (
//                                         <div className="mb-4 text-left">
//                                             <span className="inline-block p-2 rounded bg-zinc-700">
//                                                 {streamingMessage}
//                                             </span>
//                                         </div>
//                                     )}
//                                     {isLoading && <div className="text-center">AI is thinking...</div>}
//                                 </div>
//                                 <div className="mt-auto flex-shrink-0">
//                                     <PromptInputWithActions onSend={handleSendMessage}/>
//                                 </div>
//                             </CardContent>
//                         </Card>
//                         <Button onClick={onClose} className="absolute top-4 right-4" variant="ghost">
//                             <X className="h-6 w-6"/>
//                         </Button>
//                     </motion.div>
//                 </motion.div>
//             )}
//         </AnimatePresence>
//     );
// };
//
// export default ExpandedFlashcardWithChat;
