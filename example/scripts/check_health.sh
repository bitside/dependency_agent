#!/bin/bash

# Health check script

# Check system status
STATUS_FILE="./example/data/health_status.txt"
echo "System healthy at $(date)" > $STATUS_FILE

# Read previous status
if [ -f "./example/data/previous_health.txt" ]; then
    cat ./example/data/previous_health.txt
fi

# Archive current status
cp $STATUS_FILE ./example/data/previous_health.txt