# RAG Pipeline

## What is RAG?

As quoted by Google:
"RAG is a technique for augmenting LLM knowledge with additional data."

In simple terms, instead of hoping the AI magically knows everything, we give it a cheat sheet first. This project uses **Pinecone** to store document vectors and connects to various **LLM APIs** to find specific answers from your documents. Think of it as giving the AI a open-book exam instead of testing its memory.

## How does RAG work?

![RAG Architecture](/logo192.png)

When you upload a document, it gets split into smaller pieces called "chunks." Each chunk is then converted into a vector, basically a list of numbers that captures the meaning of that text. These vectors are stored in a vector database like Pinecone, ready to be searched.

When you ask a question, your question also gets converted into a vector. The system then searches for chunks with the highest cosine similarity to your question, pulls out those relevant text chunks, and sends them to the LLM as context. The LLM then generates an answer using both its general knowledge AND your specific documents.

The magic occurs when cosine similarity measures how "close" two vectors are in meaning, not just keywords.

## Real-world use cases

RAG is everywhere in production:

- **Customer support** - Bots that actually know your product documentation
- **Legal tech** - Searching through thousands of contracts for specific clauses
- **Healthcare** - Finding relevant research papers from massive databases
- **Enterprise search** - Making internal wikis actually useful

Basically anywhere you have too much text or data and not enough time.

## A Real Example I've encountered : The GitHub Docs Problem

Let's say your company has 5,000 internal docs on GitHub. A new joiner needs to find something specific about deployment procedures. They could:

- **Option A:** Ctrl+F through 5,000 docs (good luck)
- **Option B:** Ask someone and wait 3 days for a reply
- **Option C:** Use a RAG system and get the answer in milliseconds

Keywords only get you so far. RAG understands *meaning*. You can ask "how do we handle failed deployments?" and it'll find the relevant docs even if they never use the word "failed."

## Is this rocket science?

Nope. At its core, RAG is just:

1. Turn text into numbers (vectors)
2. Store those numbers
3. When someone asks a question, turn that into numbers too
4. Find which stored numbers are most similar (cosine similarity)
5. Give those original text chunks to an LLM

That's it. The rest is just engineering.

## Tech Stack

- **Vector DB:** Pinecone
- **Embeddings:** multilingual-e5-large
- **Backend:** FastAPI + LangChain
- **Frontend:** React + TypeScript
- **LLMs:** OpenRouter APIs (this is a project otherwise would never use Openrouter for private data)

## Is this the best RAG I could make?

I'd say this is the most basic RAG I could come up with to showcase my RAG pipeline building skills. This can be improved 10x by adding :
1. Hybrid search (semantic + keyword matching)
2. Reranking the output chunks to find the bestcase considering the user query
3. Multiple file support
basically moving from "it works in production" to "it actually works reliably and proves it."

## Try it out

Upload a document above and start asking questions. The sample files are there if you just want to test it quickly.

---

Built by **Omkar Patil** | [GitHub](https://github.com/omkar1344patil) | [Portfolio](https://omkarpatil.co.uk)