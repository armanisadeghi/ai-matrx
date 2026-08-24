import type {
  Timeline as TimelineKind,
  TimelineEvent as TimelineEventKind,
  TimelinePeriod as TimelinePeriodKind,
} from "@/features/content-ir/kinds/generated/kinds.generated";

/** THE SHAPES COME FROM THE REGISTRY; the parser only guarantees the render key. */
export type TimelineEvent = Omit<TimelineEventKind, "__kind" | "id"> &
  Required<Pick<TimelineEventKind, "date" | "description">> & { id: string };

export type TimelinePeriod = Omit<TimelinePeriodKind, "__kind" | "events"> & {
  events: TimelineEvent[];
};

export type TimelineData = Omit<TimelineKind, "__kind" | "periods"> & {
  periods: TimelinePeriod[];
};

export const parseTimelineMarkdown = (content: string): TimelineData | null => {
  try {
    // Remove the timeline tags
    const cleanContent = content
      .replace(/<timeline>/g, '')
      .replace(/<\/timeline>/g, '')
      .trim();

    const lines = cleanContent.split('\n').filter(line => line.length > 0);
    
    let title = '';
    let description = '';
    const periods: TimelinePeriod[] = [];
    let currentPeriod: TimelinePeriod | null = null;
    let i = 0;

    // Parse the content
    while (i < lines.length) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Extract title (first header)
      if (trimmedLine.startsWith('###') && !title) {
        title = trimmedLine.replace(/^#+\s*/, '').trim();
        i++;
        continue;
      }
      
      // Extract description (paragraph after title, but not bullet points or period headers)
      if (title && !description && !trimmedLine.startsWith('#') && !trimmedLine.startsWith('**') && !trimmedLine.startsWith('-') && trimmedLine.length > 0) {
        description = trimmedLine;
        i++;
        continue;
      }
      
      // Period headers (bold text like **Q1 2024:** or **Phase 1: Foundation & Self-Care (Weeks 1-4)**)
      if (trimmedLine.match(/^\*\*([^*]+)\*\*$/)) {
        // Save previous period
        if (currentPeriod && currentPeriod.events.length > 0) {
          periods.push(currentPeriod);
        }
        
        const periodName = trimmedLine.replace(/^\*\*([^*]+)\*\*$/, '$1').trim();
        currentPeriod = {
          period: periodName,
          events: []
        };
        i++;
        continue;
      }
      
      // Event items (bullet points with descriptions) - only top-level bullets (no indentation)
      if (line.startsWith('- ') && currentPeriod) {
        const eventText = line.replace(/^-\s*/, '').trim();
        
        // Parse event format with flexible patterns:
        // "**Title** (Date) [Category]" or "Title (Date) [Category]" or simple "Title"
        let eventTitle = eventText;
        let eventDate = '';
        let eventCategory = '';
        let eventStatus: TimelineEvent['status'] = undefined;
        let eventDescription = '';
        
        // Handle bold titles first
        const boldTitleMatch = eventText.match(/^\*\*([^*]+)\*\*(.*)$/);
        if (boldTitleMatch) {
          eventTitle = boldTitleMatch[1].trim();
          const remainder = boldTitleMatch[2].trim();
          
          // Extract date and category from remainder
          const dateMatch = remainder.match(/^\s*\(([^)]+)\)(.*)$/);
          if (dateMatch) {
            eventDate = dateMatch[1].trim();
            const afterDate = dateMatch[2].trim();
            
            // Extract category in brackets [Category]
            const categoryMatch = afterDate.match(/^\s*\[([^\]]+)\](.*)$/);
            if (categoryMatch) {
              eventCategory = categoryMatch[1].trim();
              const afterCategory = categoryMatch[2].trim();
              
              // Extract status
              if (afterCategory.toLowerCase().includes('completed')) {
                eventStatus = 'completed';
              } else if (afterCategory.toLowerCase().includes('in-progress') || afterCategory.toLowerCase().includes('in progress')) {
                eventStatus = 'in-progress';
              } else if (afterCategory.toLowerCase().includes('pending')) {
                eventStatus = 'pending';
              }
            }
          } else {
            // Check if remainder has category without date
            const categoryMatch = remainder.match(/^\s*\[([^\]]+)\](.*)$/);
            if (categoryMatch) {
              eventCategory = categoryMatch[1].trim();
            }
          }
        } else {
          // Handle non-bold titles
          const dateMatch = eventText.match(/^(.+?)\s*\(([^)]+)\)(.*)$/);
          if (dateMatch) {
            eventTitle = dateMatch[1].trim();
            eventDate = dateMatch[2].trim();
            const remainder = dateMatch[3].trim();
            
            // Extract category in brackets [Category]
            const categoryMatch = remainder.match(/^\s*\[([^\]]+)\](.*)$/);
            if (categoryMatch) {
              eventCategory = categoryMatch[1].trim();
              const afterCategory = categoryMatch[2].trim();
              
              // Extract status
              if (afterCategory.toLowerCase().includes('completed')) {
                eventStatus = 'completed';
              } else if (afterCategory.toLowerCase().includes('in-progress') || afterCategory.toLowerCase().includes('in progress')) {
                eventStatus = 'in-progress';
              } else if (afterCategory.toLowerCase().includes('pending')) {
                eventStatus = 'pending';
              }
            }
          } else {
            // Check if eventText has category without date
            const categoryMatch = eventText.match(/^(.+?)\s*\[([^\]]+)\](.*)$/);
            if (categoryMatch) {
              eventTitle = categoryMatch[1].trim();
              eventCategory = categoryMatch[2].trim();
            }
          }
        }
        
        // Look for description on next line(s) - handle indented sub-bullets and regular text
        let j = i + 1;
        const descriptionLines: string[] = [];
        while (j < lines.length) {
          const nextLine = lines[j];
          const nextTrimmed = nextLine.trim();
          
          // Stop if we hit a new top-level bullet, period header, or section header
          if (nextLine.startsWith('- ') || nextTrimmed.startsWith('**') || nextTrimmed.startsWith('#')) {
            break;
          }
          
          // Collect indented content (sub-bullets or regular text)
          if (nextTrimmed) {
            if (nextTrimmed.startsWith('-')) {
              // This is an indented sub-bullet, treat as description
              descriptionLines.push(nextTrimmed.replace(/^-\s*/, '').trim());
            } else {
              // Regular description line
              descriptionLines.push(nextTrimmed);
            }
          }
          j++;
        }
        
        eventDescription = descriptionLines.join(' ') || eventTitle;
        
        const eventId = `${currentPeriod.period}-${currentPeriod.events.length}`;
        
        currentPeriod.events.push({
          id: eventId,
          title: eventTitle,
          date: eventDate || 'TBD',
          description: eventDescription,
          status: eventStatus,
          category: eventCategory || undefined
        });
        
        i = j;
        continue;
      }
      
      i++;
    }
    
    // Add the last period
    if (currentPeriod && currentPeriod.events.length > 0) {
      periods.push(currentPeriod);
    }

    return {
      title: title || 'Timeline',
      description: description || undefined,
      periods
    };
    
  } catch (error) {
    console.error('Error parsing timeline markdown:', error);
    return null;
  }
};
