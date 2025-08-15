#!/usr/bin/perl

# Helper script that processes data

use strict;
use warnings;

# Read input file from command line
my $input_file = $ARGV[1] || '/tmp/processing.tmp';

# Process the input
open(my $in_fh, '<', $input_file) or die "Cannot open input: $!";
my @lines = <$in_fh>;
close($in_fh);

# Write processed data
my $output_file = './example/data/processed.txt';
open(my $out_fh, '>', $output_file);
print $out_fh "Processed " . scalar(@lines) . " lines\n";
close($out_fh);

# Log the processing
my $log_file = './example/data/helper.log';
open(my $log_fh, '>>', $log_file);
print $log_fh "Helper executed at " . localtime() . "\n";
close($log_fh);