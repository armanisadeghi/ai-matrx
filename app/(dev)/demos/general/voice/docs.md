# Voice Updates

As of right now, this is in pretty good shape, but there are things that need to be done.

For one, I got overly focused on the text display and other side-things that are actually more chatbot related
and I lost focus on finalizing the actual voice things, but most of it is built somewhere.

1. I need to figure out if I'm doing something wrong because I have the VAD MIC but I'm still sending things to Groq for transcription, I think.
2. There are two versions of the main hook, with slightly different basic functionality — reconciling them is only a couple minutes of work.


Start by making sure the new hook has all of the added functionality of choosing API providers, etc.

Focus on the basics first. The text, markdown, code display stuff isn't working right, but that's something to be handled when I do the chatbot or when I do the recipe display component stuff.
-- this needs to be set up, tested, etc. using sample data, as opposed to trying to set it up with real, live data coming from the api.

- Also, I don't think I'm using the best version of the cartesia vioces because they don't sound good and words like "I'm" aren't coming through correctly as compared with their playground.

# Resouces:
- https://claude.ai/chat/0d38f501-c57c-4cf3-a53d-cdf6690e42eb
- https://shiki.matsu.io/languages
- https://play.cartesia.ai/text-to-speech
- https://newsapi.org/

Voice Page UI: https://claude.ai/chat/0bb0fc1a-1baf-4e59-ac04-3d94d63e92d0
