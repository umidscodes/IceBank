package com.icebank.support;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;
import java.util.UUID;

/** Small helpers for building test data and expected values. */
public final class TestData {

    private TestData() {
    }

    /** Exact money value from a string: {@code money("1.00")}. Always scale 2. */
    public static BigDecimal money(String amount) {
        return new BigDecimal(amount).setScale(2, RoundingMode.UNNECESSARY);
    }

    /** {@code BigDecimal} -> the API's money string with 2 decimals: 1 -> "1.00". */
    public static String moneyString(BigDecimal amount) {
        return amount.setScale(2, RoundingMode.UNNECESSARY).toPlainString();
    }

    /** How the web UI shows money: 5703.95 -> "$5,703.95", -195.35 -> "-$195.35". */
    public static String uiMoney(BigDecimal amount) {
        DecimalFormat f = new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(Locale.CANADA));
        String body = "$" + f.format(amount.abs());
        return amount.signum() < 0 ? "-" + body : body;
    }

    /** A short unique text for names and memos, e.g. {@code "starter-3f9a1c2b"}. */
    public static String unique(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
