// File Location: '@/components/ui/samples/calendar.tsx'
"use client"

import * as React from 'react'
import { useState, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, setMonth, startOfMonth, startOfWeek } from 'date-fns'
import { cn } from '@/lib/utils'
import { MatrxSelect, MatrxSelectContent, MatrxSelectItem, MatrxSelectTrigger, MatrxSelectValue } from './select'
import { MatrxButton } from './button';

type DateValue = Date | undefined

interface CalendarProps {
    value?: DateValue | DateValue[]
    onChange?: (value: DateValue | DateValue[]) => void
    min?: Date
    max?: Date
    disabledDates?: Date[]
    highlightedDates?: Date[]
    mode?: 'single' | 'multiple' | 'range'
    weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
    formatDate?: (date: Date) => string
    formatMonth?: (date: Date) => string
    formatYear?: (date: Date) => string
    showOutsideDays?: boolean
    showWeekNumbers?: boolean
    numberOfMonths?: number
    defaultMonth?: Date
    fixedWeeks?: boolean
    reverseMonths?: boolean
    pagedNavigation?: boolean
    fromYear?: number
    toYear?: number
    captionLayout?: 'dropdown' | 'buttons'
    onMonthChange?: (date: Date) => void
    classNames?: {
        root?: string
        months?: string
        month?: string
        caption?: string
        caption_label?: string
        nav?: string
        nav_button?: string
        nav_button_previous?: string
        nav_button_next?: string
        table?: string
        head_row?: string
        head_cell?: string
        row?: string
        cell?: string
        day?: string
        day_selected?: string
        day_today?: string
        day_outside?: string
        day_disabled?: string
        day_range_start?: string
        day_range_end?: string
        day_range_middle?: string
        day_hidden?: string
    }
    animationLevel?: 'none' | 'basic' | 'moderate' | 'enhanced'
    showTime?: boolean
    is24Hour?: boolean
    minuteIncrement?: number
}

const MatrxCalendar = React.forwardRef<HTMLDivElement, CalendarProps>(
    ({
         value,
         onChange,
         min,
         max,
         disabledDates,
         highlightedDates,
         mode = 'single',
         weekStartsOn = 0,
         formatDate = (date: Date) => format(date, 'PP'),
         formatMonth = (date: Date) => format(date, 'MMMM'),
         formatYear = (date: Date) => format(date, 'yyyy'),
         showOutsideDays = true,
         showWeekNumbers = false,
         numberOfMonths = 1,
         defaultMonth,
         fixedWeeks = false,
         reverseMonths = false,
         pagedNavigation = false,
         fromYear = 1900,
         toYear = 2100,
         captionLayout = 'buttons',
         onMonthChange,
         classNames,
         animationLevel = 'basic',
         showTime = false,
         is24Hour = false,
         minuteIncrement = 1,
         ...props
     }, ref) => {
        const [selectedDates, setSelectedDates] = useState<DateValue | DateValue[]>(value || (mode === 'multiple' ? [] : undefined))
        const [currentMonth, setCurrentMonth] = useState(() => defaultMonth || (Array.isArray(value) ? value[0] : value) || new Date())
        const [currentYear, setCurrentYear] = useState(() => currentMonth.getFullYear())

        const handleSelect = useCallback((day: Date) => {
            let newSelectedDates: DateValue | DateValue[]

            if (mode === 'range') {
                newSelectedDates = Array.isArray(selectedDates) && selectedDates.length === 1
                    ? [selectedDates[0], day].sort((a, b) => a!.getTime() - b!.getTime())
                    : [day]
            } else if (mode === 'multiple') {
                newSelectedDates = Array.isArray(selectedDates)
                    ? selectedDates.some(d => isSameDay(d!, day))
                        ? selectedDates.filter(d => !isSameDay(d!, day))
                        : [...selectedDates, day]
                    : [day]
            } else {
                newSelectedDates = day
            }

            setSelectedDates(newSelectedDates)
            onChange?.(newSelectedDates)
        }, [selectedDates, mode, onChange])

        const handleMonthChange = useCallback((month: Date) => {
            setCurrentMonth(month)
            setCurrentYear(month.getFullYear())
            onMonthChange?.(month)
        }, [onMonthChange])

        const handleYearChange = useCallback((year: number) => {
            const newDate = setMonth(currentMonth, currentMonth.getMonth())
            newDate.setFullYear(year)
            setCurrentMonth(newDate)
            setCurrentYear(year)
            onMonthChange?.(newDate)
        }, [currentMonth, onMonthChange])

        const calendarDays = useMemo(() => {
            const days: Date[] = []
            const monthStart = startOfMonth(currentMonth)
            const monthEnd = endOfMonth(currentMonth)
            const startDate = startOfWeek(monthStart, { weekStartsOn })
            const endDate = endOfWeek(monthEnd, { weekStartsOn })

            let currentDate = startDate
            while (currentDate <= endDate) {
                days.push(currentDate)
                currentDate = addDays(currentDate, 1)
            }

            return days
        }, [currentMonth, weekStartsOn])

        const years = useMemo(() => {
            return Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i)
        }, [fromYear, toYear])

        const animationClasses = {
            none: '',
            basic: 'transition-opacity duration-200',
            moderate: 'transition-all duration-300 ease-in-out',
            enhanced: 'transition-all duration-500 ease-in-out transform hover:scale-105'
        }

        const renderDay = (day: Date) => {
            const isSelected = Array.isArray(selectedDates)
                ? selectedDates.some(d => isSameDay(d!, day))
                : selectedDates && isSameDay(selectedDates, day)
            const isDisabled = (min && day < min) || (max && day > max) || (disabledDates && disabledDates.some(d => isSameDay(d, day)))
            const isHighlighted = highlightedDates && highlightedDates.some(d => isSameDay(d, day))

            return (
                <button
                    key={day.toISOString()}
                    onClick={() => handleSelect(day)}
                    className={cn(
                        'w-10 h-10 rounded-full',
                        isSelected && 'bg-primary text-primary-foreground',
                        !isSelected && isToday(day) && 'text-accent-foreground',
                        !isSelected && !isToday(day) && !isSameMonth(day, currentMonth) && 'text-muted-foreground opacity-50',
                        isDisabled && 'opacity-50 cursor-not-allowed',
                        isHighlighted && 'ring-2 ring-accent',
                        animationClasses[animationLevel]
                    )}
                    disabled={isDisabled}
                >
                    {format(day, 'd')}
                </button>
            )
        }

        return (
            <div ref={ref} className={cn('p-3', classNames?.root)} {...props}>
                <div className={cn('flex justify-between items-center mb-4', classNames?.caption)}>
                    {captionLayout === 'dropdown' ? (
                        <>
                            <MatrxSelect value={currentMonth.getMonth().toString()} onValueChange={(value) => handleMonthChange(setMonth(currentMonth, parseInt(value)))}>
                                <MatrxSelectTrigger className="w-[120px]">
                                    <MatrxSelectValue>{formatMonth(currentMonth)}</MatrxSelectValue>
                                </MatrxSelectTrigger>
                                <MatrxSelectContent>
                                    {Array.from({ length: 12 }, (_, i) => (
                                        <MatrxSelectItem key={i} value={i.toString()}>
                                            {formatMonth(setMonth(new Date(), i))}
                                        </MatrxSelectItem>
                                    ))}
                                </MatrxSelectContent>
                            </MatrxSelect>
                            <MatrxSelect value={currentYear.toString()} onValueChange={(value) => handleYearChange(parseInt(value))}>
                                <MatrxSelectTrigger className="w-[120px]">
                                    <MatrxSelectValue>{currentYear}</MatrxSelectValue>
                                </MatrxSelectTrigger>
                                <MatrxSelectContent>
                                    {years.map((year) => (
                                        <MatrxSelectItem key={year} value={year.toString()}>
                                            {year}
                                        </MatrxSelectItem>
                                    ))}
                                </MatrxSelectContent>
                            </MatrxSelect>
                        </>
                    ) : (
                        <>
                            <MatrxButton
                                variant="outline"
                                className={cn('h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100', classNames?.nav_button, classNames?.nav_button_previous)}
                                onClick={() => handleMonthChange(addMonths(currentMonth, -1))}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </MatrxButton>
                            <div className={classNames?.caption_label}>
                                {formatMonth(currentMonth)} {currentYear}
                            </div>
                            <MatrxButton
                                variant="outline"
                                className={cn('h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100', classNames?.nav_button, classNames?.nav_button_next)}
                                onClick={() => handleMonthChange(addMonths(currentMonth, 1))}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </MatrxButton>
                        </>
                    )}
                </div>
                <div className={cn('grid grid-cols-7 gap-1', classNames?.month)}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                        <div key={day} className={cn('text-center text-sm font-medium', classNames?.head_cell)}>
                            {day}
                        </div>
                    ))}
                    {calendarDays.map((day) => (
                        <div key={day.toISOString()} className={cn('text-center', classNames?.cell)}>
                            {renderDay(day)}
                        </div>
                    ))}
                </div>
                {showTime && (
                    <div className="mt-4">
                        <TimeSelector
                            value={Array.isArray(selectedDates) ? selectedDates[0] : selectedDates}
                            onChange={(time) => {
                                if (Array.isArray(selectedDates)) {
                                    handleSelect(time)
                                } else {
                                    handleSelect(time)
                                }
                            }}
                            is24Hour={is24Hour}
                            minuteIncrement={minuteIncrement}
                        />
                    </div>
                )}
            </div>
        )
    }
)

MatrxCalendar.displayName = 'MatrxCalendar'

interface TimeSelectorProps {
    value?: Date
    onChange: (date: Date) => void
    is24Hour?: boolean
    minuteIncrement?: number
}

const TimeSelector: React.FC<TimeSelectorProps> = ({ value, onChange, is24Hour = false, minuteIncrement = 1 }) => {
    const [hours, setHours] = useState(value ? value.getHours() : 0)
    const [minutes, setMinutes] = useState(value ? value.getMinutes() : 0)
    const [ampm, setAmpm] = useState(value ? (value.getHours() >= 12 ? 'PM' : 'AM') : 'AM')

    const handleHourChange = (newHours: number) => {
        setHours(newHours)
        updateTime(newHours, minutes, ampm)
    }

    const handleMinuteChange = (newMinutes: number) => {
        setMinutes(newMinutes)
        updateTime(hours, newMinutes, ampm)
    }

    const handleAmPmChange = (newAmPm: string) => {
        setAmpm(newAmPm)
        updateTime(hours, minutes, newAmPm)
    }

    const updateTime = (h: number, m: number, ap: string) => {
        const newDate = value ? new Date(value) : new Date()
        if (!is24Hour && ap === 'PM' && h !== 12) {
            h += 12
        } else if (!is24Hour && ap === 'AM' && h === 12) {
            h = 0
        }
        newDate.setHours(h, m)
        onChange(newDate)
    }

    return (
        <div className="flex items-center space-x-2">
            <MatrxSelect value={hours.toString()} onValueChange={(value) => handleHourChange(parseInt(value))}>
                <MatrxSelectTrigger className="w-[70px]">
                    <MatrxSelectValue>{hours.toString().padStart(2, '0')}</MatrxSelectValue>
                </MatrxSelectTrigger>
                <MatrxSelectContent>
                    {Array.from({ length: is24Hour ? 24 : 12 }, (_, i) => i + (is24Hour ? 0 : 1)).map((hour) => (
                        <MatrxSelectItem key={hour} value={hour.toString()}>
                            {hour.toString().padStart(2, '0')}
                        </MatrxSelectItem>
                    ))}
                </MatrxSelectContent>
            </MatrxSelect>
            <span>:</span>
            <MatrxSelect value={minutes.toString()} onValueChange={(value) => handleMinuteChange(parseInt(value))}>
                <MatrxSelectTrigger className="w-[70px]">
                    <MatrxSelectValue>{minutes.toString().padStart(2, '0')}</MatrxSelectValue>
                </MatrxSelectTrigger>
                <MatrxSelectContent>
                    {Array.from({ length: 60 / minuteIncrement }, (_, i) => i * minuteIncrement).map((minute) => (
                        <MatrxSelectItem key={minute} value={minute.toString()}>
                            {minute.toString().padStart(2, '0')}
                        </MatrxSelectItem>
                    ))}
                </MatrxSelectContent>
            </MatrxSelect>
            {!is24Hour && (
                <MatrxSelect value={ampm} onValueChange={handleAmPmChange}>
                    <MatrxSelectTrigger className="w-[70px]">
                        <MatrxSelectValue>{ampm}</MatrxSelectValue>
                    </MatrxSelectTrigger>
                    <MatrxSelectContent>
                        <MatrxSelectItem value="AM">AM</MatrxSelectItem>
                        <MatrxSelectItem value="PM">PM</MatrxSelectItem>
                    </MatrxSelectContent>
                </MatrxSelect>
            )}
        </div>
    )
}

export { MatrxCalendar }
