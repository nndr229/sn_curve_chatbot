# app.py
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import os
import json

# pip install google-generativeai
import google.generativeai as genai

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

app = Flask(__name__)

GEMINI_MODEL_ID = os.getenv("GEMINI_MODEL_ID", "gemini-1.5-flash")

SYSTEM_PRIMER = (
    "You are an expert fatigue & fracture mechanics tutor embedded in a web app.\n"
    "You interpret S–N plots (Basquin law) and mean-stress corrections (Goodman/Gerber/Soderberg).\n"
    "You must ground ALL numeric statements in the provided graph JSON only.\n"
    "If a value is missing, say so and suggest how to obtain it (no fabrication). "
    "Explain clearly and concisely; use short equations when useful."
)


def clamp_context(ctx: dict, max_chars: int = 20000) -> str:
    """
    Safely serialize the graph JSON and clamp size to protect the prompt.
    """
    try:
        payload = json.dumps(ctx, ensure_ascii=False, separators=(",", ":"))
    except Exception:
        payload = "{}"
    if len(payload) > max_chars:
        # In rare cases of huge payloads, keep essential fields if present
        try:
            slim = {
                "curves": ctx.get("curves", [])[:8],  # first 8 curves
                "settings": ctx.get("settings", {}),
            }
            payload = json.dumps(slim, ensure_ascii=False,
                                 separators=(",", ":"))
        except Exception:
            payload = "{}"
    return payload


@app.route("/")
def index():
    warning = None if GEMINI_API_KEY else "Missing GEMINI_API_KEY in environment (.env). Chatbot will be disabled."
    return render_template("index.html", warning=warning)


@app.post("/chat")
def chat():
    if not GEMINI_API_KEY:
        return jsonify({"error": "GEMINI_API_KEY not configured"}), 400

    data = request.get_json(force=True) or {}
    user_msg = (data.get("message") or "").strip()
    context = data.get("context") or {}

    if not user_msg:
        return jsonify({"error": "Empty message"}), 400

    graph_json = clamp_context(context)

    # Build a strict, JSON-grounded prompt
    # The model sees: (1) system instruction, (2) graph JSON as context, (3) user question.
    # The rubric forces explanations & numbers to be tied to the JSON only.
    rubric = (
        "REASONING CONTRACT:\n"
        "1) Use only the GRAPH_JSON below for numeric or curve-specific facts.\n"
        "2) Prefer `scenario` values when present (Sa, Smax, Smin, R) and explain how they were derived.\n"
        "3) If a value is missing, say 'not in graph JSON'.\n"
        "4) Keep answers concise.\n"
    )

    prompt_parts = [
        # Gemini Python SDK accepts a list of parts
        {"role": "user", "parts": [
            # System-like content (Gemini lets us pass system_instruction separately too)
            f"{rubric}\n\nGRAPH_JSON:\n```json\n{graph_json}\n```\n\nUSER_QUESTION:\n{user_msg}\n"
        ]}
    ]

    try:
        model = genai.GenerativeModel(
            GEMINI_MODEL_ID,
            system_instruction=SYSTEM_PRIMER
        )
        resp = model.generate_content(prompt_parts)
        text = resp.text if hasattr(resp, "text") else "(No response)"
        return jsonify({"reply": text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3000, debug=True)
