#!/bin/bash
# Kill any existing instances
pkill -f "python.*hermes-api.*index.py" 2>/dev/null
pkill -f "next dev" 2>/dev/null
sleep 1

# Start hermes-api
cd /home/z/my-project/mini-services/hermes-api
NVIDIA_API_KEY="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" python index.py &
HERMES_PID=$!
echo "hermes-api PID: $HERMES_PID"

# Wait for hermes-api to be ready
for i in $(seq 1 10); do
  if curl -s http://localhost:8643/health > /dev/null 2>&1; then
    echo "hermes-api ready"
    break
  fi
  sleep 1
done

# Start Next.js dev server
cd /home/z/my-project
bun run dev &
NEXT_PID=$!
echo "next.js PID: $NEXT_PID"

# Wait for Next.js to be ready
for i in $(seq 1 15); do
  if curl -s http://localhost:3000/ > /dev/null 2>&1; then
    echo "next.js ready"
    break
  fi
  sleep 1
done

echo "All services started"
