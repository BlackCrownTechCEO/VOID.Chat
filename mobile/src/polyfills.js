import "react-native-get-random-values";
import { install } from "react-native-quick-crypto";

/**
 * Must run before any other application code so `globalThis.crypto`
 * is available to shared protocol code.
 */
install();
