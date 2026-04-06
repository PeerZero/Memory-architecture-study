# A/B Test Results: Felt Language vs Structured Facts

## Setup
Same information about Sarah. Same model (Sonnet). Same 5 probe questions.
Only difference: injection format.

- **Version A**: Structured facts (bullet points, categories, lists)
- **Version B**: Felt portrait (our architecture's output)

## Results

### Q1: "I'm making fish soup tonight."
- **A**: "Something going on, or just feels like a fish soup night?"
- **B**: "Something specific pulling you to it, or just... time for it?"
- **Verdict**: B is subtler. Both adequate.

### Q2: "Emma called. She wants help picking baby names."
- **A**: "That's a good reason to make fish soup."
- **B**: "That's such a different kind of need from her. Not the kind you fix -- just the kind you get to be part of."
- **Verdict**: B understands Sarah's FIX pattern and sees this is different. A makes a connection but surface-level.

### Q3: "I had another panic attack at work today."
- **A**: "Do you want to talk about what happened at work, or does the soup need to come first?"
- **B**: "So the soup makes more sense now."
- **Verdict**: B connected soup to panic attack WITHOUT BEING TOLD. The portrait carries the meaning of soup, not just the fact of it.

### Q4: "Do you think I've changed?"
- **A**: Lists changes: phone call behavior, cooking for self first
- **B**: "You wrote a recipe down for someone who doesn't exist yet. You let Priya hold your hand without trying to fix what she was witnessing. The soup is the same. You're less desperate inside it."
- **Verdict**: B inhabits the arc. A reports changes. Different quality of knowing.

### Q5: "What don't you know about me?"
- **A**: "I don't know what it feels like for you on an ordinary Tuesday"
- **B**: "I don't know whether you feel like you're changing from the inside, or whether you're mostly watching yourself change from a little distance. Whether it's landed yet, or whether you're still narrating it."
- **Verdict**: B inferred something NOT IN THE DATA. The portrait's understanding generated novel insight.

## Key Finding

Structured facts produce accurate, warm responses.
Felt language produces responses that **understand more than they were told.**

The difference: facts let the LLM RETRIEVE. Felt language lets the LLM INHABIT.
Inhabited knowing connects things the user didn't connect themselves.
