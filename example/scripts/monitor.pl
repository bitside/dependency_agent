#!/usr/bin/perl

# Example Perl script for monitoring

use strict;
use warnings;

# Read configuration file passed as argument
my $config_file = $ARGV[1] || './example/config/settings-that-should-not-be-read.ini';

# Read the configuration
open(my $fh, '<', $config_file) or die "Cannot open config: $!";
my @config = <$fh>;
close($fh);

# Check status file
my $status_file = './example/data/status.txt';
if (-e $status_file) {
    open(my $status_fh, '<', $status_file);
    my $status = <$status_fh>;
    close($status_fh);
}

# Write monitoring log
my $log_file = './example/data/monitor.log';
open(my $log_fh, '>>', $log_file);
print $log_fh "Monitor check at " . localtime() . "\n";
close($log_fh);

# Execute system command
system("./example/scripts/check_health.sh");

# Read from dynamic path (will be unresolvable)
my $data_dir = $ENV{'DATA_DIR'} || '/var/data';
my $data_file = "$data_dir/metrics.csv";
if (-e $data_file) {
    open(my $data_fh, '<', $data_file);
    # Process data...
    close($data_fh);
}