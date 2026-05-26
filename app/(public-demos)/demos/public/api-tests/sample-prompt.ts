export const TEST_ADMIN_TOKEN = "75ba80cb-2508-4423-8fc1-4216a6b44212";


export const PROMPT_SAMPLE_1 = {
    "messages": [
        {
            "role": "system",
            "content": "You're a very helpful assistant."
        },
        {
            "role": "user",
            "content": "Can you explain the basics of the book 'The Great Gatsby'?"
        }
    ],
    "settings": {
        // "model_id": "db1b859c-ab1a-41e8-bdda-d7b0bff7ec82", // Google Gemini Flash Latest
        "model_id": "548126f2-714a-4562-9001-0c31cbeea375", // gpt-4.1-mini
        "top_p": 1,
        "stream": true,
        "max_tokens": 8000,
        "temperature": 0.5,
        "thinking_budget": 1024,
        "include_thoughts": true,
        "internal_url_context": true,
        "file_urls": true,
        "image_urls": true,
        "youtube_videos": true,
        "internal_web_search": true,
        "tools": []
    }
}


export const PROMPT_SAMPLE_2 = {
    "messages": [
        {
            "role": "system",
            "content": "You're a very helpful assistant.\n\nAnswer with concise response."
        },
        {
            "role": "user",
            "content": "Can you explain the basics of the book 'The Great Gatsby'?"
        }
    ],
    "settings": {
        "model_id": "db1b859c-ab1a-41e8-bdda-d7b0bff7ec82", // Google Gemini Flash Latest
        "top_p": 1,
        "stream": true,
        "max_tokens": 8000,
        "temperature": 0.5,
        "thinking_budget": 1024,
        "include_thoughts": true,
        "internal_url_context": true,
        "file_urls": true,
        "image_urls": true,
        "youtube_videos": true,
        "internal_web_search": true,
        "tools": [
            "core_web_search"
        ]
    }
}

export const get_prompt_sample = (name: string) => {
    switch (name) {
        case 'small_test_prompt':
            return PROMPT_SAMPLE_1;
        case 'tools_test_prompt':
            return PROMPT_SAMPLE_2;
        default:
            return null;
    }
}