package com.icebank.tests.ui;

import com.icebank.api.InboxClient;
import com.icebank.config.Config;
import com.icebank.db.Db;
import com.icebank.support.Personas;
import com.icebank.support.TestData;
import com.icebank.ui.DriverExtension;
import com.icebank.ui.pages.DashboardPage;
import com.icebank.ui.pages.LoginPage;
import com.icebank.ui.pages.OtpPage;
import io.qameta.allure.Feature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.openqa.selenium.WebDriver;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("ui")
@Feature("Sign-in")
@ExtendWith(DriverExtension.class)
@DisplayName("Sign-in in the browser")
class LoginUiTest {

    @Test
    @DisplayName("Emma signs in with the Ice Mail code and the dashboard shows her chequing balance")
    void emmaSignsInAndSeesChequingBalance(WebDriver driver) {
        OtpPage otp = new LoginPage(driver).open().signIn(Personas.EMMA, Personas.password());
        assertThat(otp.shownEmail()).isEqualTo(Personas.EMMA);

        // The code arrives in Ice Mail; a test reads it through the inbox API instead of opening /mail.
        String code = InboxClient.latestOtp(Personas.EMMA);
        DashboardPage dashboard = otp.enterCode(code);

        assertThat(dashboard.greeting()).contains("Emma");
        BigDecimal balance = Db.reader().scalar(BigDecimal.class,
                "SELECT balance FROM accounts WHERE sandbox_id = ? AND id = ?", Config.sandboxId(), Personas.EMMA_CHEQUING);
        assertThat(dashboard.balanceText("chequing"))
                .matches("-?\\$\\d{1,3}(,\\d{3})*\\.\\d{2}")
                .isEqualTo(TestData.uiMoney(balance));
    }
}
