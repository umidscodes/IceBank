package com.icebank.api;

import com.icebank.model.InboxMessage;
import com.icebank.model.Page;
import io.qameta.allure.Step;
import io.restassured.common.mapper.TypeRef;
import io.restassured.response.Response;

import java.util.List;
import java.util.Optional;

import static io.restassured.RestAssured.given;

/**
 * Ice Mail, the fake inbox where sign-in codes and links arrive. Uses the sandbox key, so it can read
 * any inbox in your sandbox without signing in: {@code GET /inbox?email=...&kind=OTP&size=1}.
 */
public final class InboxClient {

    private InboxClient() {
    }

    /** Raw call: newest first. {@code kind} may be null (all kinds): OTP, PASSWORD_RESET, ETRANSFER, ... */
    public static Response list(String email, String kind, int size) {
        var spec = given().spec(Specs.sandbox()).queryParam("email", email).queryParam("size", size);
        if (kind != null) {
            spec.queryParam("kind", kind);
        }
        return spec.when().get("/inbox");
    }

    /** The newest messages of a kind, as objects. */
    public static List<InboxMessage> messages(String email, String kind, int size) {
        return list(email, kind, size).then().statusCode(200).extract().as(new TypeRef<Page<InboxMessage>>() {
        }).content();
    }

    /** The newest OTP message, if there is one. */
    public static Optional<InboxMessage> latestOtpMessage(String email) {
        return messages(email, "OTP", 1).stream().findFirst();
    }

    /** The code from the newest OTP message. Throws if the inbox has no OTP. */
    @Step("Read the newest sign-in code for {email} from Ice Mail")
    public static String latestOtp(String email) {
        return latestOtpMessage(email)
                .map(InboxMessage::otpCode)
                .orElseThrow(() -> new IllegalStateException("No OTP message in Ice Mail for " + email));
    }
}
