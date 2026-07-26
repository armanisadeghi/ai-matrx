'use client'

import { useState, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { motion } from 'motion/react'
import { Copy, RefreshCw, Check, AlertCircle, CircleDot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { toast } from "@/lib/toast";
import { cn } from '@/lib/utils'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default function UUIDGenerator() {
    const [currentUUID, setCurrentUUID] = useState(uuidv4())
    const [multipleUUIDs, setMultipleUUIDs] = useState<string[]>([])
    const [quantity, setQuantity] = useState('10')
    const [format, setFormat] = useState<'standard' | 'uppercase' | 'lowercase'>('standard')
    const [validatorInput, setValidatorInput] = useState('')
    const [isValid, setIsValid] = useState<boolean | null>(null)
    const [copied, setCopied] = useState<string | null>(null)

    // Animation variants
    const buttonVariants = {
        pressed: { scale: 0.95 },
        released: { scale: 1 }
    }

    const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
    }

    // Handle text selection on click
    const handleInputClick = (e: React.MouseEvent<HTMLInputElement>) => {
        e.currentTarget.select()
    }

    const generateNewUUID = () => {
        setCurrentUUID(uuidv4())
    }

    const generateMultipleUUIDs = () => {
        const uuids = Array.from({ length: parseInt(quantity) }, () => {
            const uuid = uuidv4()
            switch (format) {
                case 'uppercase':
                    return uuid.toUpperCase()
                case 'lowercase':
                    return uuid.toLowerCase()
                default:
                    return uuid
            }
        })
        setMultipleUUIDs(uuids)
    }

    const validateUUID = (uuid: string) => {
        setValidatorInput(uuid)
        if (!uuid) {
            setIsValid(null)
            return
        }
        setIsValid(UUID_REGEX.test(uuid))
    }

    const copyToClipboard = async (text: string) => {
        await navigator.clipboard.writeText(text)
        setCopied(text)
        setTimeout(() => setCopied(null), 1500)
        toast.success('Copied to clipboard!')
    }

    const copyAllToClipboard = async () => {
        await navigator.clipboard.writeText(multipleUUIDs.join('\n'))
        toast.success('All UUIDs copied to clipboard!')
    }

    return (
        <div className="container max-w-4xl mx-auto p-6 space-y-8">
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="space-y-4"
            >
                <div className="flex items-center space-x-2">
                    <h1 className="text-4xl font-bold tracking-tight">UUID Generator</h1>
                    <CircleDot className="w-8 h-8 text-primary animate-pulse" />
                </div>
                <p className="text-muted-foreground">
                    Generate and validate secure, random UUIDs (Universally Unique Identifiers)
                </p>
            </motion.div>

            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="p-6 border rounded-lg shadow-sm bg-card relative overflow-hidden"
            >
                {/* Add a subtle gradient accent */}
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent dark:from-primary/10" />

                <div className="relative flex items-center space-x-4">
                    <Input
                        value={currentUUID}
                        readOnly
                        onClick={handleInputClick}
                        className="font-mono text-lg min-w-[500px] cursor-pointer hover:bg-accent/50 transition-colors"
                    />
                    <motion.div whileTap="pressed" variants={buttonVariants}>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard(currentUUID)}
                            className="group"
                        >
                            {copied === currentUUID ? (
                                <Check className="h-4 w-4 text-green-500" />
                            ) : (
                                 <Copy className="h-4 w-4 group-hover:text-primary transition-colors" />
                             )}
                        </Button>
                    </motion.div>
                    <motion.div whileTap="pressed" variants={buttonVariants}>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={generateNewUUID}
                            className="hover:text-primary hover:border-primary transition-colors"
                        >
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                    </motion.div>
                </div>
            </motion.div>

            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="p-6 border rounded-lg shadow-sm bg-card space-y-4 relative overflow-hidden"
            >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent dark:via-primary/10" />
                <h3 className="text-lg font-semibold relative">UUID Validator</h3>
                <div className="space-y-2 relative">
                    <div className="flex items-center space-x-4">
                        <Input
                            value={validatorInput}
                            onChange={(e) => validateUUID(e.target.value)}
                            onClick={handleInputClick}
                            placeholder="Enter UUID to validate..."
                            className="font-mono text-lg min-w-[500px]"
                        />
                        {isValid !== null && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className={cn(
                                    "flex items-center space-x-2 px-4 py-2 rounded-md",
                                    isValid ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                                )}
                            >
                                {isValid ? (
                                    <Check className="h-4 w-4" />
                                ) : (
                                     <AlertCircle className="h-4 w-4" />
                                 )}
                                <span>{isValid ? "Valid UUID" : "Invalid UUID"}</span>
                            </motion.div>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Multiple UUIDs Section */}
            <div className="space-y-6">
                <div className="flex items-end gap-4">
                    <div className="space-y-2">
                        <Label>Quantity</Label>
                        <Select value={quantity} onValueChange={setQuantity}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Select quantity" />
                            </SelectTrigger>
                            <SelectContent>
                                {[10, 25, 50, 100].map((num) => (
                                    <SelectItem key={num} value={num.toString()}>
                                        {num} UUIDs
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Format</Label>
                        <Select
                            value={format}
                            onValueChange={(value: 'standard' | 'uppercase' | 'lowercase') => setFormat(value)}
                        >
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Select format" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="standard">Standard</SelectItem>
                                <SelectItem value="uppercase">Uppercase</SelectItem>
                                <SelectItem value="lowercase">Lowercase</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <motion.div whileTap="pressed" variants={buttonVariants}>
                        <Button
                            onClick={generateMultipleUUIDs}
                            className="bg-primary hover:bg-primary/90"
                        >
                            Generate
                        </Button>
                    </motion.div>
                </div>

                {multipleUUIDs.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4"
                    >
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-semibold">Generated UUIDs</h3>
                            <motion.div whileTap="pressed" variants={buttonVariants}>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={copyAllToClipboard}
                                    className="hover:text-primary hover:border-primary transition-colors"
                                >
                                    Copy All
                                </Button>
                            </motion.div>
                        </div>
                        <div className="border rounded-lg p-4 bg-card max-h-[600px] overflow-y-auto">
                            {multipleUUIDs.map((uuid, index) => (
                                <motion.div
                                    key={uuid}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    onClick={() => copyToClipboard(uuid)}
                                    className={cn(
                                        "flex items-center justify-between py-2 px-4 cursor-pointer",
                                        "hover:bg-accent/50 rounded-md transition-colors",
                                        "group relative"
                                    )}
                                >
                                    <code className="font-mono text-lg">{uuid}</code>
                                    {copied === uuid ? (
                                        <Check className="h-4 w-4 text-green-500" />
                                    ) : (
                                         <Copy className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                     )}
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    )
}
