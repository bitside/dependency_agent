#!/bin/bash

# Example shell script that demonstrates various file operations

# Read configuration
CONFIG_FILE="/var/data/main.conf"
source $CONFIG_FILE

# Read input data
INPUT_FILE="./example/data/input.txt"
cat $INPUT_FILE > /tmp/processing.tmp

# Write output
OUTPUT_FILE="./example/data/output.log"
echo "Processing completed at $(date)" >> $OUTPUT_FILE

# Execute another script
./example/scripts/helper.pl --input /tmp/processing.tmp

# Use environment variable (will be flagged as unresolvable)
cp $BASE_DIR/template.txt ./example/data/result.txt

# Clean up
rm /tmp/processing.tmp