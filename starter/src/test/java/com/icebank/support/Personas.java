package com.icebank.support;

import com.icebank.config.Config;

/**
 * Seeded Ice Bank users. The email suffix of the environment is applied, so on QA with suffix {@code +s3}
 * {@link #EMMA} is {@code emma.tremblay+s3@icebank.test}. Ids are the same in every sandbox after a reset.
 * Every persona's password is {@link Config#personaPassword()}.
 *
 * <p>Test data rule of thumb: read persona data, but write (transfers, payees, ...) with a customer nobody
 * else depends on, and never assume a balance: read it first.
 */
public final class Personas {

    /** Customer 1. Happy path: chequing 1, savings 2, credit card 3, loan 4. */
    public static final String EMMA = email("emma.tremblay");
    /** Customer 2. Locked out until a teller unlocks him. */
    public static final String LIAM = email("liam.chen");
    /** Customer 3. Credit card $40 under its $5,000 limit. */
    public static final String OLIVIA = email("olivia.singh");
    /** Customer 4. Brand new, chequing only, $0.00, no history. */
    public static final String NOAH = email("noah.martin");
    /** Customer 5. Chequing (account 10) frozen by a teller. */
    public static final String AVA = email("ava.roy");
    /** Customer 6. Loan application in review, pending cheque deposit. */
    public static final String LUCAS = email("lucas.gagnon");
    /** User 51, role ADMIN: the teller portal. */
    public static final String TELLER = email("teller");

    /**
     * Customer 7, a background customer (chequing + savings) that no tutorial scenario uses.
     * The starter's own write tests (transfers, the wrong-password check) use her so they do not disturb
     * Emma's balances, history or failed-login counter for anyone else.
     */
    public static final String SOPHIE = email("sophie.bouchard");

    /** Customer ids (the same in every sandbox after a reset). */
    public static final long EMMA_CUSTOMER_ID = 1;
    public static final long SOPHIE_CUSTOMER_ID = 7;

    /** Emma's account ids: 1 chequing, 2 savings, 3 credit card, 4 loan. */
    public static final long EMMA_CHEQUING = 1;
    public static final long EMMA_SAVINGS = 2;
    public static final long EMMA_CREDIT = 3;
    public static final long EMMA_LOAN = 4;
    /** Liam's chequing: another customer's account, for "404, not 403" checks. */
    public static final long LIAM_CHEQUING = 5;

    private Personas() {
    }

    /** {@code "emma.tremblay"} -> {@code "emma.tremblay" + emailSuffix + "@icebank.test"}. */
    public static String email(String localPart) {
        return localPart + Config.emailSuffix() + "@icebank.test";
    }

    public static String password() {
        return Config.personaPassword();
    }
}
